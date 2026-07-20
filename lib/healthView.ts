/**
 * Health-screen derived views for the glass-orb redesign (Phase 3).
 *
 * Everything here is computed from real TodayState data — no invented metrics.
 * The Health reference mock also showed Respiratory Rate, Fitbit "Stress
 * Balance", Body Battery and Hydration; none of those exist in
 * DailyHealthSnapshot, so (per product decision) they are replaced with metrics
 * we actually track:
 *   - Top grid   : HRV · Resting HR · Sleep · Steps  (wearable, real)
 *   - Recovery   : Sleep Quality (readiness sleep sub-score) · Recovery
 *                  (readiness score) · Energy · Stress (morning check-in)
 *
 * Quality labels are banded against the user's personal baseline where one
 * exists, and fall back to neutral copy when the baseline is still forming.
 */

import { readinessWord } from "@/lib/readiness";
import type { TodayState } from "@/types/today";

export type Tone = "good" | "warn" | "neutral";

export interface HealthMetric {
  key: "hrv" | "rhr" | "sleep" | "steps";
  label: string;
  /** Formatted headline value, e.g. "82 ms", "7h 32m". */
  value: string;
  /** One-word quality band, e.g. "Elevated", "Excellent". */
  quality: string;
  tone: Tone;
  /** Day-over-day delta string, e.g. "+21 ms"; null when no comparison. */
  delta: string | null;
  deltaPositive: boolean | null;
}

export interface RecoverySignal {
  key: "sleepQuality" | "recovery" | "energy" | "stress";
  label: string;
  /** 0–100 score; null when the underlying signal is missing (e.g. no check-in). */
  score: number | null;
  quality: string;
  tone: Tone;
  /** Provenance note shown under the card, e.g. "From check-in". */
  note: string;
  /** True when the signal comes from the subjective morning check-in. */
  subjective: boolean;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function fmtSleep(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function signed(n: number, suffix: string): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))}${suffix}`;
}

// ─── History helpers ─────────────────────────────────────────────────────────

type HistoryEntry = TodayState["history"][number];

/** Most recent prior day (before `date`) with a non-null value for the metric. */
function priorValue(
  history: HistoryEntry[],
  date: string,
  pick: (e: HistoryEntry) => number | null,
): number | null {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i];
    if (e.date >= date) continue;
    const v = pick(e);
    if (v !== null) return v;
  }
  return null;
}

// ─── Top metric grid ─────────────────────────────────────────────────────────

/** Banded quality vs a personal baseline; direction = "higher is better" etc. */
function bandVsBaseline(
  value: number | null,
  baseline: number | null,
  higherIsBetter: boolean,
  labels: { good: string; neutral: string; warn: string },
): { quality: string; tone: Tone } {
  if (value === null) return { quality: "—", tone: "neutral" };
  if (baseline === null || baseline === 0) {
    return { quality: labels.neutral, tone: "neutral" };
  }
  const ratio = value / baseline;
  const up = ratio >= 1.05;
  const down = ratio <= 0.95;
  const near = !up && !down;
  if (near) return { quality: labels.neutral, tone: "neutral" };
  const better = higherIsBetter ? up : down;
  return better
    ? { quality: labels.good, tone: "good" }
    : { quality: labels.warn, tone: "warn" };
}

export function buildHealthMetrics(state: TodayState): HealthMetric[] {
  const { snapshot, baseline, history, date } = state;

  const yHrv = priorValue(history, date, (e) => e.hrv);
  const yRhr = priorValue(history, date, (e) => e.restingHr);
  const ySleep = priorValue(history, date, (e) => e.sleepMinutes);
  const ySteps = priorValue(history, date, (e) => e.steps);

  const hrvBand = bandVsBaseline(snapshot.hrv, baseline.hrv, true, {
    good: "Elevated",
    neutral: "Balanced",
    warn: "Suppressed",
  });
  const rhrBand = bandVsBaseline(snapshot.restingHr, baseline.restingHr, false, {
    good: "Excellent",
    neutral: "Steady",
    warn: "Elevated",
  });

  // Sleep quality banded on absolute duration (target-agnostic, honest thresholds).
  const sleepBand: { quality: string; tone: Tone } =
    snapshot.sleepMinutes === null
      ? { quality: "—", tone: "neutral" }
      : snapshot.sleepMinutes >= 420
        ? { quality: "Restful", tone: "good" }
        : snapshot.sleepMinutes >= 360
          ? { quality: "Adequate", tone: "neutral" }
          : { quality: "Short", tone: "warn" };

  const stepsBand = bandVsBaseline(snapshot.steps, baseline.steps, true, {
    good: "Active",
    neutral: "On track",
    warn: "Low",
  });

  const hrvDelta =
    snapshot.hrv !== null && yHrv !== null ? snapshot.hrv - yHrv : null;
  const rhrDelta =
    snapshot.restingHr !== null && yRhr !== null
      ? snapshot.restingHr - yRhr
      : null;
  const sleepDelta =
    snapshot.sleepMinutes !== null && ySleep !== null
      ? snapshot.sleepMinutes - ySleep
      : null;
  const stepsDelta =
    snapshot.steps !== null && ySteps !== null ? snapshot.steps - ySteps : null;

  return [
    {
      key: "hrv",
      label: "HRV",
      value: snapshot.hrv !== null ? `${Math.round(snapshot.hrv)} ms` : "—",
      quality: hrvBand.quality,
      tone: hrvBand.tone,
      delta: hrvDelta === null ? null : signed(hrvDelta, " ms"),
      deltaPositive: hrvDelta === null ? null : hrvDelta >= 0,
    },
    {
      key: "rhr",
      label: "Resting HR",
      value:
        snapshot.restingHr !== null ? `${Math.round(snapshot.restingHr)} bpm` : "—",
      quality: rhrBand.quality,
      tone: rhrBand.tone,
      delta: rhrDelta === null ? null : signed(rhrDelta, " bpm"),
      // Lower resting HR is the improvement.
      deltaPositive: rhrDelta === null ? null : rhrDelta <= 0,
    },
    {
      key: "sleep",
      label: "Sleep",
      value: fmtSleep(snapshot.sleepMinutes),
      quality: sleepBand.quality,
      tone: sleepBand.tone,
      delta: sleepDelta === null ? null : signed(sleepDelta, "m"),
      deltaPositive: sleepDelta === null ? null : sleepDelta >= 0,
    },
    {
      key: "steps",
      label: "Steps",
      value:
        snapshot.steps !== null ? Math.round(snapshot.steps).toLocaleString() : "—",
      quality: stepsBand.quality,
      tone: stepsBand.tone,
      delta: stepsDelta === null ? null : signed(stepsDelta, ""),
      deltaPositive: stepsDelta === null ? null : stepsDelta >= 0,
    },
  ];
}

// ─── Recovery signals ────────────────────────────────────────────────────────

function scoreTone(score: number, higherIsBetter = true): Tone {
  const good = higherIsBetter ? score >= 70 : score <= 40;
  const warn = higherIsBetter ? score < 45 : score > 65;
  if (good) return "good";
  if (warn) return "warn";
  return "neutral";
}

function bandWord(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Low";
}

export function buildRecoverySignals(state: TodayState): RecoverySignal[] {
  const { readiness, checkIn } = state;

  // Sleep quality: readiness sleep sub-score as a percentage of its max.
  const sleepSub = readiness.breakdown.sleep;
  const sleepQuality =
    sleepSub.dataSource === "real" && sleepSub.maxPts > 0
      ? Math.round((sleepSub.score / sleepSub.maxPts) * 100)
      : null;

  const recoveryScore = Math.round(readiness.score);

  const energy = checkIn ? checkIn.energyLevel * 10 : null;
  const stress = checkIn ? checkIn.stressLevel * 10 : null;

  return [
    {
      key: "sleepQuality",
      label: "Sleep Quality",
      score: sleepQuality,
      quality: sleepQuality === null ? "No data" : bandWord(sleepQuality),
      tone: sleepQuality === null ? "neutral" : scoreTone(sleepQuality),
      note: "Sleep sub-score",
      subjective: false,
    },
    {
      key: "recovery",
      label: "Recovery",
      score: recoveryScore,
      quality: readinessWord(recoveryScore),
      tone: scoreTone(recoveryScore),
      note: "Readiness engine",
      subjective: false,
    },
    {
      key: "energy",
      label: "Energy",
      score: energy,
      quality:
        energy === null ? "Check in" : energy >= 70 ? "High" : energy >= 40 ? "Moderate" : "Low",
      tone: energy === null ? "neutral" : scoreTone(energy),
      note: "From check-in",
      subjective: true,
    },
    {
      key: "stress",
      label: "Stress",
      score: stress,
      quality:
        stress === null ? "Check in" : stress <= 30 ? "Low" : stress <= 60 ? "Moderate" : "High",
      // Lower stress is better.
      tone: stress === null ? "neutral" : scoreTone(stress, false),
      note: "From check-in",
      subjective: true,
    },
  ];
}
