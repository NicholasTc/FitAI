/**
 * Baseline computation — rolling means, standard deviations, and deltas.
 *
 * Handles sparse data gracefully:
 * - Uses only days where the metric is non-null.
 * - Returns null for any metric with fewer than 2 data points (mean) or 3 (SD).
 * - status "forming" when daysWithData < 5, "ready" when >= 5.
 *
 * Phase 2 addition: per-metric standard deviations (sdHrv, sdRestingHr,
 * sdSleepMinutes) and sample counts (nHrv, nRestingHr, nSleepMinutes).
 * These gate z-score scoring in lib/readiness.ts — z-scoring activates only
 * when n >= 14 AND SD is non-trivially large (metric-specific thresholds).
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

/** Sample standard deviation. Returns null when fewer than 3 values. */
function stdDev(values: number[]): number | null {
  if (values.length < 3) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
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
 * Compute rolling statistics from the provided history (excluding today),
 * then compare today against those statistics.
 *
 * Pass up to 28 days of history for stable z-score baselines (Phase 2).
 * With only 7 days the means and deltas work as before; SD gates simply won't
 * activate until enough data accumulates.
 */
export function computeBaseline(
  history: DailySnapshot[], // ordered oldest → newest
  today: DailySnapshot,
): DailyBaseline {
  // Exclude today so we compare against prior days only.
  const prior = history.filter((s) => s.date !== today.date);

  const daysWithData = prior.filter(
    (s) =>
      s.sleepMinutes !== null ||
      s.restingHr !== null ||
      s.hrv !== null ||
      s.steps !== null ||
      s.activeMinutes !== null,
  ).length;

  // Pick non-null values per metric for mean + SD computation.
  const hrvValues       = pick(prior, "hrv");
  const rhrValues       = pick(prior, "restingHr");
  const sleepValues     = pick(prior, "sleepMinutes");
  const effValues       = pick(prior, "sleepEfficiency");
  const stepsValues     = pick(prior, "steps");
  const activeValues    = pick(prior, "activeMinutes");
  const calValues       = pick(prior, "totalCalories");

  const baseline: WeeklyBaseline = {
    // Means
    sleepMinutes:    average(sleepValues),
    sleepEfficiency: average(effValues),
    restingHr:       average(rhrValues),
    hrv:             average(hrvValues),
    steps:           average(stepsValues),
    activeMinutes:   average(activeValues),
    totalCalories:   average(calValues),

    // Phase 2: standard deviations + sample counts
    sdHrv:          stdDev(hrvValues),
    sdRestingHr:    stdDev(rhrValues),
    sdSleepMinutes: stdDev(sleepValues),
    nHrv:           hrvValues.length,
    nRestingHr:     rhrValues.length,
    nSleepMinutes:  sleepValues.length,

    daysWithData,
    status: daysWithData >= 5 ? "ready" : "forming",
  };

  return {
    baseline,
    today,
    deltas: {
      sleepMinutes:  delta(today.sleepMinutes,  baseline.sleepMinutes),
      restingHr:     delta(today.restingHr,     baseline.restingHr),
      hrv:           delta(today.hrv,           baseline.hrv),
      steps:         delta(today.steps,         baseline.steps),
      activeMinutes: delta(today.activeMinutes, baseline.activeMinutes),
      totalCalories: delta(today.totalCalories, baseline.totalCalories),
    },
    history,
  };
}
