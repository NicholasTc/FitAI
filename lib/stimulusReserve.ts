/**
 * Stimulus Reserve — flagship remaining-training-capacity estimate (Feature 3).
 *
 * Combines recent zone load, HRV/RHR vs baseline, sleep, and check-in into a
 * 0–100 reserve % with capacity guidance. Presented as an estimate, not a guarantee.
 */

import type { CheckInData } from "@/types/today";
import type { DailySnapshot, WeeklyBaseline } from "@/types/snapshot";
import type { TrainingLoadResult } from "@/lib/trainingLoad";
import {
  canUseZScore,
  clamp,
  MIN_SD_HRV,
  MIN_SD_RHR,
} from "@/lib/physiology";

export type SuggestedZone = "fat_burn" | "cardio" | "recovery" | "rest";

export interface StimulusReserveResult {
  reservePct: number;
  confidence: "high" | "medium" | "low";
  /** Suggested remaining moderate–hard training window today. */
  capacityRangeMinutes: { min: number; max: number };
  suggestedZone: SuggestedZone;
  suggestedZoneLabel: string;
  suggestedZoneMinutes: number;
  /** One-line capacity copy, e.g. "Ready for 45–60 minutes of moderate-hard training." */
  capacityCopy: string;
  /** Suggestion copy, e.g. "Suggested: Fat Burn with up to 12 min Cardio/Peak." */
  suggestionCopy: string;
  drivers: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "Estimate only — not a guarantee that injury or overtraining cannot occur.";

export function computeStimulusReserve(
  snapshot: DailySnapshot,
  baseline: WeeklyBaseline,
  trainingLoad: TrainingLoadResult,
  checkIn: CheckInData | null,
): StimulusReserveResult {
  const drivers: string[] = [];
  let score = 55; // neutral starting point
  let signals = 0;

  // Zone / training load (recent stimulus already taken)
  if (trainingLoad.method !== "insufficient-data" && trainingLoad.ratio !== null) {
    signals += 1;
    const r = trainingLoad.ratio;
    if (r > 1.4) {
      score -= 18;
      drivers.push("Recent zone load is well above your chronic norm");
    } else if (r > 1.15) {
      score -= 10;
      drivers.push("Recent zone load is elevated");
    } else if (r < 0.75) {
      score += 10;
      drivers.push("Recent zone load is light — more capacity available");
    } else {
      drivers.push("Recent zone load is near your usual range");
    }
  }

  // Today's already-logged zone minutes reduce remaining capacity
  const todayZones =
    (snapshot.fatBurnMin ?? 0) + (snapshot.cardioMin ?? 0) + (snapshot.peakMin ?? 0);
  if (todayZones > 0) {
    signals += 1;
    if (todayZones >= 60) {
      score -= 15;
      drivers.push(`${todayZones} zone minutes already today`);
    } else if (todayZones >= 30) {
      score -= 8;
      drivers.push(`${todayZones} zone minutes already today`);
    } else {
      drivers.push(`${todayZones} zone minutes logged today`);
    }
  }

  // HRV
  if (snapshot.hrv !== null && baseline.hrv !== null) {
    signals += 1;
    const sd = baseline.sdHrv ?? null;
    const n = baseline.nHrv ?? 0;
    if (canUseZScore(n, sd, MIN_SD_HRV)) {
      const z = (snapshot.hrv - baseline.hrv) / sd!;
      score += clamp(Math.round(z * 6), -12, 12);
      drivers.push(
        z >= 0.5
          ? "HRV above baseline supports more stimulus"
          : z <= -0.5
            ? "HRV below baseline — keep stimulus conservative"
            : "HRV near baseline",
      );
    }
  }

  // RHR
  if (snapshot.restingHr !== null && baseline.restingHr !== null) {
    signals += 1;
    const sd = baseline.sdRestingHr ?? null;
    const n = baseline.nRestingHr ?? 0;
    if (canUseZScore(n, sd, MIN_SD_RHR)) {
      const z = (snapshot.restingHr - baseline.restingHr) / sd!;
      score += clamp(Math.round(-z * 5), -10, 10);
      drivers.push(
        z >= 0.5
          ? "Elevated resting HR suggests limited reserve"
          : z <= -0.5
            ? "Low resting HR supports training"
            : "Resting HR near baseline",
      );
    }
  }

  // Sleep
  if (snapshot.sleepMinutes !== null) {
    signals += 1;
    if (snapshot.sleepMinutes >= 420) {
      score += 6;
      drivers.push("Sleep duration looks solid");
    } else if (snapshot.sleepMinutes < 360) {
      score -= 10;
      drivers.push("Short sleep reduces available stimulus");
    }
  }

  // Check-in
  if (checkIn) {
    signals += 1;
    const feel = (checkIn.energyLevel + (11 - checkIn.stressLevel) + checkIn.motivation) / 3;
    score += clamp(Math.round((feel - 5.5) * 3), -10, 10);
    drivers.push(
      feel >= 7
        ? "Subjective check-in feels strong"
        : feel <= 4
          ? "Subjective check-in is low — respect it"
          : "Subjective check-in is mixed",
    );
  }

  const reservePct = clamp(Math.round(score), 0, 100);

  const confidence: StimulusReserveResult["confidence"] =
    signals >= 4 ? "high" : signals >= 2 ? "medium" : "low";

  let capacityRangeMinutes: { min: number; max: number };
  let suggestedZone: SuggestedZone;
  let suggestedZoneMinutes: number;

  if (reservePct >= 75) {
    capacityRangeMinutes = { min: 45, max: 75 };
    suggestedZone = "cardio";
    suggestedZoneMinutes = 20;
  } else if (reservePct >= 55) {
    capacityRangeMinutes = { min: 30, max: 60 };
    suggestedZone = "fat_burn";
    suggestedZoneMinutes = 12;
  } else if (reservePct >= 40) {
    capacityRangeMinutes = { min: 20, max: 40 };
    suggestedZone = "fat_burn";
    suggestedZoneMinutes = 0;
  } else {
    capacityRangeMinutes = { min: 0, max: 25 };
    suggestedZone = reservePct < 25 ? "rest" : "recovery";
    suggestedZoneMinutes = 0;
  }

  const suggestedZoneLabel =
    suggestedZone === "fat_burn"
      ? "Fat Burn"
      : suggestedZone === "cardio"
        ? "Cardio / Peak"
        : suggestedZone === "recovery"
          ? "Easy recovery"
          : "Rest";

  const capacityCopy =
    reservePct < 25
      ? "Capacity is low — prioritize recovery over training today."
      : `Ready for ${capacityRangeMinutes.min}–${capacityRangeMinutes.max} minutes of moderate-hard training.`;

  const suggestionCopy =
    suggestedZone === "rest"
      ? "Suggested: full rest or very easy movement only."
      : suggestedZone === "recovery"
        ? "Suggested: easy recovery cardio only."
        : suggestedZone === "cardio"
          ? `Suggested: Fat Burn base with up to ${suggestedZoneMinutes} minutes in Cardio/Peak.`
          : suggestedZoneMinutes > 0
            ? `Suggested: Fat Burn with up to ${suggestedZoneMinutes} minutes in Cardio/Peak.`
            : "Suggested: Fat Burn / moderate zone only.";

  return {
    reservePct,
    confidence,
    capacityRangeMinutes,
    suggestedZone,
    suggestedZoneLabel,
    suggestedZoneMinutes,
    capacityCopy,
    suggestionCopy,
    drivers: drivers.slice(0, 4),
    disclaimer: DISCLAIMER,
  };
}
