/**
 * Physical & cognitive recovery states — Feature 6.
 *
 * Qualitative bands only (strong / moderate / low) — never claims exact
 * "body-recovery hours" or "brain-recovery hours".
 */

import type { CheckInData } from "@/types/today";
import type { DailySnapshot, WeeklyBaseline } from "@/types/snapshot";
import type { TrainingLoadResult } from "@/lib/trainingLoad";
import {
  canUseZScore,
  MIN_SD_HRV,
  MIN_SD_RHR,
} from "@/lib/physiology";

export type RecoveryBand = "strong" | "moderate" | "low" | "unknown";

export interface RecoveryState {
  band: RecoveryBand;
  label: string;
  /** Short human reasons — which signals drove the estimate. */
  drivenBy: string[];
  score: number | null; // 0–100 internal; null when unknown
}

export interface RecoveryStatesResult {
  physical: RecoveryState;
  cognitive: RecoveryState;
}

function bandFromScore(score: number | null): { band: RecoveryBand; label: string } {
  if (score === null) return { band: "unknown", label: "Unknown" };
  if (score >= 70) return { band: "strong", label: "Strong" };
  if (score >= 45) return { band: "moderate", label: "Moderate" };
  return { band: "low", label: "Low" };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function computeRecoveryStates(
  snapshot: DailySnapshot,
  baseline: WeeklyBaseline,
  checkIn: CheckInData | null,
  trainingLoad?: TrainingLoadResult,
): RecoveryStatesResult {
  // ── Physical: RHR z + deep sleep proportion + training load ───────────────
  const physicalDrivers: string[] = [];
  const physicalParts: number[] = [];

  if (snapshot.restingHr !== null && baseline.restingHr !== null) {
    const sd = baseline.sdRestingHr ?? null;
    const n = baseline.nRestingHr ?? 0;
    if (canUseZScore(n, sd, MIN_SD_RHR)) {
      const z = (snapshot.restingHr - baseline.restingHr) / sd!;
      // Lower RHR is better → invert
      const pts = clamp01(((-z + 2) / 4) * 100);
      physicalParts.push(pts);
      physicalDrivers.push(
        z <= -0.5
          ? `Resting HR ${Math.round(snapshot.restingHr)} bpm (below your norm)`
          : z >= 0.5
            ? `Resting HR ${Math.round(snapshot.restingHr)} bpm (elevated vs norm)`
            : `Resting HR near your baseline`,
      );
    } else if (baseline.status !== "forming") {
      const ratio = baseline.restingHr / snapshot.restingHr;
      physicalParts.push(clamp01(ratio * 70));
      physicalDrivers.push(`Resting HR ${Math.round(snapshot.restingHr)} bpm`);
    }
  }

  if (
    snapshot.sleepDeepMin !== null &&
    snapshot.sleepMinutes !== null &&
    snapshot.sleepMinutes > 0
  ) {
    const deepRatio = snapshot.sleepDeepMin / snapshot.sleepMinutes;
    const pts =
      deepRatio >= 0.18 ? 85 : deepRatio >= 0.13 ? 65 : deepRatio >= 0.08 ? 45 : 25;
    physicalParts.push(pts);
    physicalDrivers.push(
      `Deep sleep ${snapshot.sleepDeepMin} min (${Math.round(deepRatio * 100)}% of night)`,
    );
  }

  if (trainingLoad && trainingLoad.method !== "insufficient-data" && trainingLoad.ratio !== null) {
    const r = trainingLoad.ratio;
    const pts = r > 1.3 ? 30 : r > 1.1 ? 50 : r >= 0.8 ? 75 : 85;
    physicalParts.push(pts);
    physicalDrivers.push(
      r > 1.2
        ? "Recent training load is spiked"
        : r < 0.8
          ? "Recent training load is light (fresh)"
          : "Training load is in a normal range",
    );
  }

  const physicalScore =
    physicalParts.length > 0
      ? Math.round(physicalParts.reduce((a, b) => a + b, 0) / physicalParts.length)
      : null;
  const physicalBand = bandFromScore(physicalScore);

  // ── Cognitive: HRV z + REM + awake interruptions + check-in ───────────────
  const cognitiveDrivers: string[] = [];
  const cognitiveParts: number[] = [];

  if (snapshot.hrv !== null && baseline.hrv !== null) {
    const sd = baseline.sdHrv ?? null;
    const n = baseline.nHrv ?? 0;
    if (canUseZScore(n, sd, MIN_SD_HRV)) {
      const z = (snapshot.hrv - baseline.hrv) / sd!;
      const pts = clamp01(((z + 2) / 4) * 100);
      cognitiveParts.push(pts);
      cognitiveDrivers.push(
        z >= 0.5
          ? `HRV ${Math.round(snapshot.hrv)} ms (above your norm)`
          : z <= -0.5
            ? `HRV ${Math.round(snapshot.hrv)} ms (below your norm)`
            : `HRV near your baseline`,
      );
    } else if (baseline.status !== "forming") {
      const ratio = snapshot.hrv / baseline.hrv;
      cognitiveParts.push(clamp01(ratio * 70));
      cognitiveDrivers.push(`HRV ${Math.round(snapshot.hrv)} ms`);
    }
  }

  if (
    snapshot.sleepRemMin !== null &&
    snapshot.sleepMinutes !== null &&
    snapshot.sleepMinutes > 0
  ) {
    const remRatio = snapshot.sleepRemMin / snapshot.sleepMinutes;
    const pts =
      remRatio >= 0.22 ? 85 : remRatio >= 0.18 ? 70 : remRatio >= 0.12 ? 50 : 30;
    cognitiveParts.push(pts);
    cognitiveDrivers.push(
      `REM ${snapshot.sleepRemMin} min (${Math.round(remRatio * 100)}% of night)`,
    );
  }

  if (snapshot.sleepAwakeMin !== null && snapshot.sleepMinutes !== null) {
    const awake = snapshot.sleepAwakeMin;
    const pts = awake <= 20 ? 85 : awake <= 40 ? 60 : awake <= 60 ? 40 : 20;
    cognitiveParts.push(pts);
    cognitiveDrivers.push(
      awake <= 20
        ? `Few interruptions (${awake} min awake)`
        : `More interruptions (${awake} min awake)`,
    );
  }

  if (checkIn) {
    const stressPts = clamp01((11 - checkIn.stressLevel) * 10);
    const energyPts = clamp01(checkIn.energyLevel * 10);
    cognitiveParts.push(Math.round((stressPts + energyPts) / 2));
    cognitiveDrivers.push(
      `Check-in: energy ${checkIn.energyLevel}/10, stress ${checkIn.stressLevel}/10`,
    );
  }

  const cognitiveScore =
    cognitiveParts.length > 0
      ? Math.round(cognitiveParts.reduce((a, b) => a + b, 0) / cognitiveParts.length)
      : null;
  const cognitiveBand = bandFromScore(cognitiveScore);

  return {
    physical: {
      band: physicalBand.band,
      label: physicalBand.label,
      drivenBy: physicalDrivers.slice(0, 3),
      score: physicalScore,
    },
    cognitive: {
      band: cognitiveBand.band,
      label: cognitiveBand.label,
      drivenBy: cognitiveDrivers.slice(0, 3),
      score: cognitiveScore,
    },
  };
}
