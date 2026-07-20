/**
 * Post-workout recalculation — Feature 4.
 *
 * After a session is logged, estimate stimulus received, remaining reserve,
 * and whether the session landed below / within / above a productive band.
 */

import type { StimulusReserveResult } from "@/lib/stimulusReserve";

export type ProductiveBand = "below" | "within" | "above";

export interface WorkoutImpactInput {
  durationMinutes: number;
  /** 1–10 RPE when available; defaults to 5. */
  rpe?: number | null;
  /** Optional zone minutes if known from wearable. */
  fatBurnMin?: number | null;
  cardioMin?: number | null;
  peakMin?: number | null;
}

export interface WorkoutImpactResult {
  stimulusReceived: number; // session load units
  reserveBefore: number;
  reserveAfter: number;
  band: ProductiveBand;
  bandLabel: string;
  summary: string;
}

function sessionStimulus(input: WorkoutImpactInput): number {
  const zoneStrain =
    (input.fatBurnMin ?? 0) * 1 +
    (input.cardioMin ?? 0) * 2 +
    (input.peakMin ?? 0) * 3;
  if (zoneStrain > 0) return Math.round(zoneStrain);

  const rpe = input.rpe && input.rpe > 0 ? input.rpe : 5;
  return Math.round(rpe * input.durationMinutes);
}

/**
 * Map session stimulus into a productive band relative to pre-workout reserve.
 * High reserve → productive window is larger; low reserve → even moderate sessions "above".
 */
export function computeWorkoutImpact(
  workout: WorkoutImpactInput,
  reserveBefore: StimulusReserveResult | { reservePct: number },
): WorkoutImpactResult {
  const stimulusReceived = sessionStimulus(workout);
  const before = reserveBefore.reservePct;

  // Rough mapping: each ~30 stimulus units costs ~8 reserve points
  const cost = Math.min(45, Math.round(stimulusReceived / 30) * 8);
  const reserveAfter = Math.max(0, Math.min(100, before - cost));

  // Productive band: session should use ~15–35% of available reserve
  const usedFrac = before > 0 ? cost / before : 1;
  let band: ProductiveBand;
  if (usedFrac < 0.15) band = "below";
  else if (usedFrac <= 0.4) band = "within";
  else band = "above";

  const bandLabel =
    band === "below"
      ? "Below productive range"
      : band === "within"
        ? "Within productive range"
        : "Above productive range";

  const summary =
    band === "within"
      ? "Solid session — stimulus matched available capacity."
      : band === "below"
        ? "Light relative to your reserve — room for more if you feel good."
        : "Hard relative to your reserve — plan easier recovery next.";

  return {
    stimulusReceived,
    reserveBefore: before,
    reserveAfter,
    band,
    bandLabel,
    summary,
  };
}
