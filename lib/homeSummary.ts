/**
 * Home-screen derived views for the glass-orb redesign (Phase 1).
 *
 * Everything here is computed from real TodayState data:
 *   - "What changed since yesterday" = today's snapshot vs the most recent
 *     prior day that has data (from history).
 *   - Sparklines = the last N daily values for each metric (from history).
 *   - "Today's capacity" = a deterministic mapping from the readiness band.
 *
 * NOTE FOR REVIEW: the capacity copy (intensity %, work-hour ranges) is new
 * product wording keyed to the readiness band — the driver is the real score,
 * but the exact ranges are a design choice and can be tuned.
 */

import type { ScoreBand } from "@/lib/guardrails";
import type { TodayState } from "@/types/today";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ChangeMetricKey = "sleep" | "hrv" | "rhr";

export interface ChangeRow {
  key: ChangeMetricKey;
  name: string;
  /** e.g. "+42m", "+21ms", "-3 bpm"; null when today's value is missing. */
  delta: string | null;
  /** True when the change is an improvement (drives lime vs red colouring). */
  positive: boolean | null;
  /** Formatted current value, e.g. "7h 32m", "82 ms", "52 bpm". */
  value: string;
  color: string;
  /** Sparkline polyline points over a 70×26 viewBox (empty when no series). */
  spark: string;
  /** Last point of the sparkline for the trailing dot. */
  sparkLast: { x: number; y: number } | null;
}

export interface ChangeSummary {
  headline: string;
  /** "up" | "down" | "flat" — drives icon + colour. */
  direction: "up" | "down" | "flat";
  description: string;
  rows: ChangeRow[];
  /** True when there was no prior day to compare against. */
  insufficient: boolean;
}

export interface CapacityCard {
  value: string;
  sub: string;
}

export interface Capacity {
  training: CapacityCard;
  work: CapacityCard;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function fmtSleep(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

const SPARK_W = 70;
const SPARK_H = 26;
const SPARK_PAD = 4;

function buildSpark(values: number[]): {
  points: string;
  last: { x: number; y: number } | null;
} {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return { points: "", last: null };
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const stepX = (SPARK_W - 2 * SPARK_PAD) / (pts.length - 1);
  const usableH = SPARK_H - 2 * SPARK_PAD;
  const coords = pts.map((v, i) => {
    const x = SPARK_PAD + i * stepX;
    // Higher value → higher on the chart (smaller y).
    const y = SPARK_PAD + (1 - (v - min) / span) * usableH;
    return { x: +x.toFixed(1), y: +y.toFixed(1) };
  });
  return {
    points: coords.map((c) => `${c.x},${c.y}`).join(" "),
    last: coords[coords.length - 1],
  };
}

// ─── History helpers ───────────────────────────────────────────────────────────

type HistoryEntry = TodayState["history"][number];

function sortedHistory(state: TodayState): HistoryEntry[] {
  return [...state.history].sort((a, b) => a.date.localeCompare(b.date));
}

/** Last N non-null values for a metric, oldest → newest. */
function series(
  history: HistoryEntry[],
  pick: (e: HistoryEntry) => number | null,
  n = 7,
): number[] {
  const vals = history
    .map(pick)
    .filter((v): v is number => v !== null);
  return vals.slice(-n);
}

/** Most recent prior day (before `date`) with a non-null value for the metric. */
function priorValue(
  history: HistoryEntry[],
  date: string,
  pick: (e: HistoryEntry) => number | null,
): number | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (e.date >= date) continue;
    const v = pick(e);
    if (v !== null) return v;
  }
  return null;
}

// ─── "What changed since yesterday" ─────────────────────────────────────────────

export function summarizeChange(state: TodayState): ChangeSummary {
  const history = sortedHistory(state);
  const { date, snapshot } = state;

  const ySleep = priorValue(history, date, (e) => e.sleepMinutes);
  const yHrv = priorValue(history, date, (e) => e.hrv);
  const yRhr = priorValue(history, date, (e) => e.restingHr);

  const sleepDelta =
    snapshot.sleepMinutes !== null && ySleep !== null
      ? snapshot.sleepMinutes - ySleep
      : null;
  const hrvDelta =
    snapshot.hrv !== null && yHrv !== null ? snapshot.hrv - yHrv : null;
  const rhrDelta =
    snapshot.restingHr !== null && yRhr !== null
      ? snapshot.restingHr - yRhr
      : null;

  const sleepSpark = buildSpark(series(history, (e) => e.sleepMinutes));
  const hrvSpark = buildSpark(series(history, (e) => e.hrv));
  const rhrSpark = buildSpark(series(history, (e) => e.restingHr));

  const rows: ChangeRow[] = [
    {
      key: "sleep",
      name: "Sleep",
      delta:
        sleepDelta === null
          ? null
          : `${sleepDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(sleepDelta))}m`,
      positive: sleepDelta === null ? null : sleepDelta >= 0,
      value: fmtSleep(snapshot.sleepMinutes),
      color: "#8b7cf6",
      spark: sleepSpark.points,
      sparkLast: sleepSpark.last,
    },
    {
      key: "hrv",
      name: "HRV",
      delta:
        hrvDelta === null
          ? null
          : `${hrvDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(hrvDelta))}ms`,
      positive: hrvDelta === null ? null : hrvDelta >= 0,
      value: snapshot.hrv !== null ? `${Math.round(snapshot.hrv)} ms` : "—",
      color: "#58c27a",
      spark: hrvSpark.points,
      sparkLast: hrvSpark.last,
    },
    {
      key: "rhr",
      name: "Resting HR",
      delta:
        rhrDelta === null
          ? null
          : `${rhrDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(rhrDelta))} bpm`,
      // For resting HR, a decrease is the improvement.
      positive: rhrDelta === null ? null : rhrDelta <= 0,
      value:
        snapshot.restingHr !== null
          ? `${Math.round(snapshot.restingHr)} bpm`
          : "—",
      color: "#ef5b5b",
      spark: rhrSpark.points,
      sparkLast: rhrSpark.last,
    },
  ];

  // Net direction: +1 per improvement, −1 per regression across available deltas.
  let net = 0;
  let compared = 0;
  for (const r of rows) {
    if (r.positive === null) continue;
    compared++;
    net += r.positive ? 1 : -1;
  }

  const insufficient = compared === 0;
  const direction: ChangeSummary["direction"] =
    insufficient || net === 0 ? "flat" : net > 0 ? "up" : "down";
  const headline = insufficient
    ? "Not enough history yet"
    : direction === "up"
      ? "Readiness improved"
      : direction === "down"
        ? "Readiness dipped"
        : "Readiness steady";

  const description = insufficient
    ? "Once you have a couple of days of data, we'll show how today compares with yesterday."
    : buildDescription(sleepDelta, hrvDelta, rhrDelta);

  return { headline, direction, description, rows, insufficient };
}

function buildDescription(
  sleepDelta: number | null,
  hrvDelta: number | null,
  rhrDelta: number | null,
): string {
  const parts: string[] = [];
  if (sleepDelta !== null && Math.abs(sleepDelta) >= 1) {
    const m = Math.abs(Math.round(sleepDelta));
    parts.push(`you slept ${m}m ${sleepDelta >= 0 ? "longer" : "less"}`);
  }
  if (hrvDelta !== null && Math.abs(hrvDelta) >= 1) {
    const v = Math.abs(Math.round(hrvDelta));
    parts.push(`HRV ${hrvDelta >= 0 ? "increased" : "decreased"} ${v} ms`);
  }
  if (rhrDelta !== null && Math.abs(rhrDelta) >= 1) {
    const v = Math.abs(Math.round(rhrDelta));
    parts.push(
      `your resting heart rate ${rhrDelta <= 0 ? "decreased" : "increased"} ${v} bpm`,
    );
  }
  if (parts.length === 0) return "Your key signals are steady versus yesterday.";

  const joined =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}

// ─── "Today's capacity" ─────────────────────────────────────────────────────────

/**
 * Deterministic training + work capacity keyed to the readiness band.
 * Driver (band) is real; the specific ranges are tunable design copy.
 */
export function computeCapacity(
  band: ScoreBand,
  deepWorkLabel: string,
): Capacity {
  const work = (value: string): CapacityCard => ({ value, sub: deepWorkLabel });
  switch (band) {
    case "push-peak":
      return {
        training: { value: "High", sub: "80–90% intensity" },
        work: work("9–10 h"),
      };
    case "push":
      return {
        training: { value: "Moderate", sub: "65–75% intensity" },
        work: work("8–9 h"),
      };
    case "maintain-high":
      return {
        training: { value: "Moderate", sub: "60–70% intensity" },
        work: work("6–8 h"),
      };
    case "maintain-low":
      return {
        training: { value: "Easy", sub: "55–65% intensity" },
        work: work("4–6 h"),
      };
    case "recover":
      return {
        training: { value: "Light", sub: "Walk / mobility" },
        work: work("2–4 h"),
      };
    case "rest":
      return {
        training: { value: "Rest", sub: "Full recovery" },
        work: work("Minimal"),
      };
  }
}
