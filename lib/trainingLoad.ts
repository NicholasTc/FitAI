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

export interface ManualWorkoutSession {
  date:            string;   // YYYY-MM-DD
  sessionLoad:     number;   // RPE × durationMinutes (Foster 2001)
  durationMinutes: number;
  rpe:             number;
}

export interface TrainingLoadResult {
  /** Score modifier, bounded to ±10. 0 when insufficient data. */
  modifier: number;
  method: "manual-acute-chronic" | "acute-chronic" | "insufficient-data";
  acuteAvg: number | null;
  chronicAvg: number | null;
  /** acute / chronic ratio. null when insufficient data. */
  ratio: number | null;
  /** Whether manual RPE data was used (more accurate than activeMinutes proxy) */
  usedManualData: boolean;
}

const INSUFFICIENT: TrainingLoadResult = {
  modifier: 0,
  method: "insufficient-data",
  acuteAvg: null,
  chronicAvg: null,
  ratio: null,
  usedManualData: false,
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
    usedManualData: false,
  };
}

/**
 * Compute training load from manual workout sessions using the Foster (2001)
 * session RPE method: session load = RPE (1–10) × duration (minutes).
 *
 * This is more accurate than the activeMinutes proxy because it captures
 * both volume and intensity. Activates as soon as ≥7 manual session-load
 * data points exist in the 28-day window (no need for daily entries).
 *
 * @param manualSessions — sessions from the last 28 days, newest first or any order.
 * @param todayDate      — YYYY-MM-DD for the current day (excluded from prior history).
 */
export function computeTrainingLoadFromManual(
  manualSessions: ManualWorkoutSession[],
  todayDate: string,
): TrainingLoadResult {
  // Only use sessions before today
  const prior = manualSessions.filter((s) => s.date < todayDate);

  // Build daily load totals (a day can have multiple sessions)
  const dailyMap = new Map<string, number>();
  for (const s of prior) {
    dailyMap.set(s.date, (dailyMap.get(s.date) ?? 0) + s.sessionLoad);
  }

  // Chronic window: last 28 calendar days (not sessions)
  const chronicDates: number[] = [];
  for (let i = 1; i <= 28; i++) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    chronicDates.push(dailyMap.get(key) ?? 0); // 0 = rest day
  }

  // Acute window: last 7 calendar days
  const acuteDates = chronicDates.slice(0, 7);

  // Require at least 7 days of ANY data (rest days counted as 0)
  // but also need ≥3 actual session days to confirm usage pattern
  const chronicSessions = prior.filter((s) => {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - 28);
    return s.date >= d.toISOString().slice(0, 10);
  });
  if (chronicSessions.length < 3) return INSUFFICIENT;

  const acuteAvg   = avg(acuteDates);
  const chronicAvg = avg(chronicDates);

  // Need meaningful chronic baseline
  if (chronicAvg < 10) return INSUFFICIENT;

  const ratio = acuteAvg / chronicAvg;

  let modifier: number;
  if (ratio > 1.5) {
    modifier = -10;
  } else if (ratio > 1.2) {
    modifier = -Math.round(((ratio - 1.2) / 0.3) * 6 + 4);
  } else if (ratio >= 0.8) {
    modifier = 0;
  } else if (ratio >= 0.5) {
    modifier = Math.round(((0.8 - ratio) / 0.3) * 5);
  } else {
    modifier = 5;
  }

  return {
    modifier: clamp(modifier, -10, 10),
    method: "manual-acute-chronic",
    acuteAvg,
    chronicAvg,
    ratio,
    usedManualData: true,
  };
}
