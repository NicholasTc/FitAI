/**
 * Training load computation — Phase 3 accuracy improvement.
 *
 * Computes an acute:chronic workload ratio (ACWR) from stored snapshots.
 * Based on the well-established ACWR model used in sports science:
 *   - Acute load  = average daily strain over the last 7 days
 *   - Chronic load = average daily strain over the last 28 days
 *   - ratio = acute / chronic
 *
 * When ratio > 1.2 the athlete is spiking load above their norm → score dampened.
 * When ratio < 0.8 the athlete is tapering below norm → small positive modifier.
 * Within 0.8–1.2 → neutral.
 *
 * GATE: contributes 0 (neutral) until ≥14 chronic days with active-minutes data.
 * This means Phase 3 is completely dormant for the first ~28 days and then
 * self-activates as history accumulates — it can never degrade early accuracy.
 *
 * Strain proxy: activeMinutes (primary). Simple but sufficient for a first pass;
 * calories above resting can be layered in once total-calories data is stable.
 */

import type { DailySnapshot } from "@/types/snapshot";

export interface TrainingLoadResult {
  /** Score modifier, bounded to ±10. 0 when insufficient data. */
  modifier: number;
  method: "acute-chronic" | "insufficient-data";
  acuteAvg: number | null;
  chronicAvg: number | null;
  /** acute / chronic ratio. null when insufficient data. */
  ratio: number | null;
}

const INSUFFICIENT: TrainingLoadResult = {
  modifier: 0,
  method: "insufficient-data",
  acuteAvg: null,
  chronicAvg: null,
  ratio: null,
};

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Daily strain proxy: active minutes.
 * Returns null when the day has no activity data (not worn / not synced).
 */
function dailyStrain(s: DailySnapshot): number | null {
  return s.activeMinutes;
}

/**
 * Compute training load from up to 28 days of prior history.
 *
 * @param priorHistory — snapshots ordered oldest → newest, NOT including today.
 *   Pass at least 28 days for the chronic window to activate.
 */
export function computeTrainingLoad(
  priorHistory: DailySnapshot[],
): TrainingLoadResult {
  // Chronic window: last 28 prior days
  const chronicWindow = priorHistory.slice(-28);
  const chronicValues = chronicWindow
    .map(dailyStrain)
    .filter((v): v is number => v !== null);

  // Require ≥14 valid chronic days before activating
  if (chronicValues.length < 14) return INSUFFICIENT;

  // Acute window: last 7 prior days
  const acuteWindow = priorHistory.slice(-7);
  const acuteValues = acuteWindow
    .map(dailyStrain)
    .filter((v): v is number => v !== null);

  // Require ≥3 valid acute days
  if (acuteValues.length < 3) return INSUFFICIENT;

  const acuteAvg   = avg(acuteValues);
  const chronicAvg = avg(chronicValues);

  // Avoid division by zero for sedentary chronic baselines
  if (chronicAvg < 1) return INSUFFICIENT;

  const ratio = acuteAvg / chronicAvg;

  // Map ratio to modifier:
  //   ratio > 1.5  → −10 (severe spike)
  //   1.2–1.5      → −4 to −10 (moderate spike)
  //   0.8–1.2      →  0 (normal variation, no adjustment)
  //   0.5–0.8      → +3 to +5 (tapering below norm → fresh)
  //   < 0.5        → +5
  let modifier: number;
  if (ratio > 1.5) {
    modifier = -10;
  } else if (ratio > 1.2) {
    // Linear: 1.2 → -4, 1.5 → -10
    modifier = -Math.round(((ratio - 1.2) / 0.3) * 6 + 4);
  } else if (ratio >= 0.8) {
    modifier = 0;
  } else if (ratio >= 0.5) {
    // Linear: 0.8 → 0, 0.5 → +5
    modifier = Math.round(((0.8 - ratio) / 0.3) * 5);
  } else {
    modifier = 5;
  }

  return {
    modifier: clamp(modifier, -10, 10),
    method: "acute-chronic",
    acuteAvg,
    chronicAvg,
    ratio,
  };
}
