/**
 * Baseline computation — rolling averages and deltas from stored snapshots.
 *
 * Handles sparse data gracefully:
 * - Uses only days where the metric is non-null.
 * - Returns null for any metric with fewer than 2 data points.
 * - status "forming" when daysWithData < 5, "ready" when >= 5.
 */

import type {
  DailyBaseline,
  DailySnapshot,
  MetricDelta,
  WeeklyBaseline,
} from "@/types/snapshot";

function average(values: number[]): number | null {
  if (values.length < 2) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pick(snapshots: DailySnapshot[], key: keyof DailySnapshot): number[] {
  return snapshots
    .map((s) => s[key] as number | null | string)
    .filter((v): v is number => typeof v === "number");
}

function delta(today: number | null, avg: number | null): MetricDelta {
  if (today === null || avg === null) return { value: null, direction: null };
  const diff = today - avg;
  const direction: MetricDelta["direction"] =
    Math.abs(diff) < 0.5 ? "flat" : diff > 0 ? "up" : "down";
  return { value: diff, direction };
}

/**
 * Compute rolling averages from the provided history (excluding today),
 * then compare today against those averages.
 */
export function computeBaseline(
  history: DailySnapshot[], // ordered oldest → newest
  today: DailySnapshot,
): DailyBaseline {
  // Exclude today from the baseline window so we compare against prior days.
  const prior = history.filter((s) => s.date !== today.date);

  const daysWithData = prior.filter(
    (s) =>
      s.sleepMinutes !== null ||
      s.restingHr !== null ||
      s.hrv !== null ||
      s.steps !== null ||
      s.activeMinutes !== null,
  ).length;

  const baseline: WeeklyBaseline = {
    sleepMinutes: average(pick(prior, "sleepMinutes")),
    sleepEfficiency: average(pick(prior, "sleepEfficiency")),
    restingHr: average(pick(prior, "restingHr")),
    hrv: average(pick(prior, "hrv")),
    steps: average(pick(prior, "steps")),
    activeMinutes: average(pick(prior, "activeMinutes")),
    daysWithData,
    status: daysWithData >= 5 ? "ready" : "forming",
  };

  return {
    baseline,
    today,
    deltas: {
      // For sleep, "up" is good. For restingHr, "down" is good.
      // The delta value and direction are reported as-is; callers decide sign interpretation.
      sleepMinutes: delta(today.sleepMinutes, baseline.sleepMinutes),
      restingHr: delta(today.restingHr, baseline.restingHr),
      hrv: delta(today.hrv, baseline.hrv),
      steps: delta(today.steps, baseline.steps),
      activeMinutes: delta(today.activeMinutes, baseline.activeMinutes),
    },
    history,
  };
}
