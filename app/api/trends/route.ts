/**
 * GET /api/trends?range=7|30|90&date=YYYY-MM-DD
 *
 * Ranged readiness + biometric trend series for the Trends screen.
 * Reuses the per-day readiness computation from the weekly route, but over a
 * configurable window, and also computes the prior window of equal length so
 * the UI can show week-over-week (or period-over-period) deltas.
 *
 * Everything returned is derived from stored snapshots + check-ins — no mocks.
 */

import { auth } from "@/lib/auth";
import { computeBaseline } from "@/lib/baseline";
import { computeReadiness } from "@/lib/readiness";
import { loadSnapshots } from "@/lib/sync";
import { db } from "@/lib/db";
import type { CheckInData } from "@/types/today";
import type { TrendPoint, TrendStats, TrendsRange, TrendsResponse } from "@/types/trends";
import { type NextRequest, NextResponse } from "next/server";

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function lastNonNull(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null) return values[i];
  }
  return null;
}

function statsOf(points: TrendPoint[]): TrendStats {
  return {
    readiness: avg(points.map((p) => p.score)),
    sleepMinutes: avg(points.map((p) => p.sleepMinutes)),
    hrv: avg(points.map((p) => p.hrv)),
    restingHr: avg(points.map((p) => p.restingHr)),
  };
}

function delta(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a - b;
}

function parseRange(raw: string | null): TrendsRange {
  const n = Number(raw);
  if (n === 30) return 30;
  if (n === 90) return 90;
  return 7;
}

function buildInsight(
  range: TrendsRange,
  deltas: TrendStats,
  hasPrior: boolean,
  points: TrendPoint[],
): string {
  const dataDays = points.filter(
    (p) => p.sleepMinutes !== null || p.hrv !== null || p.restingHr !== null,
  ).length;

  if (!hasPrior || dataDays < 3) {
    return "Keep logging — a few more days of data unlocks period-over-period trends and personalised insights.";
  }

  const period = `prior ${range} days`;
  const r = deltas.readiness;

  // Identify the strongest contributing signal.
  const contributions: { text: string; magnitude: number }[] = [];
  if (deltas.sleepMinutes !== null && Math.abs(deltas.sleepMinutes) >= 5) {
    contributions.push({
      text: `${deltas.sleepMinutes >= 0 ? "longer" : "shorter"} sleep`,
      magnitude: Math.abs(deltas.sleepMinutes) / 20,
    });
  }
  if (deltas.hrv !== null && Math.abs(deltas.hrv) >= 2) {
    contributions.push({
      text: `${deltas.hrv >= 0 ? "higher" : "lower"} HRV`,
      magnitude: Math.abs(deltas.hrv) / 5,
    });
  }
  if (deltas.restingHr !== null && Math.abs(deltas.restingHr) >= 1) {
    contributions.push({
      text: `${deltas.restingHr <= 0 ? "lower" : "higher"} resting HR`,
      magnitude: Math.abs(deltas.restingHr) / 3,
    });
  }
  contributions.sort((a, b) => b.magnitude - a.magnitude);
  const lead = contributions[0]?.text;

  if (r !== null && r >= 2) {
    return `Readiness is up ${Math.round(r)} pts vs the ${period}${lead ? ` — led by ${lead}` : ""}. Keep protecting what's working.`;
  }
  if (r !== null && r <= -2) {
    return `Readiness is down ${Math.abs(Math.round(r))} pts vs the ${period}${lead ? ` — largely ${lead}` : ""}. Prioritise recovery this week.`;
  }
  return `Readiness is holding steady vs the ${period}${lead ? `, with ${lead} the main mover` : ""}.`;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const date =
    request.nextUrl.searchParams.get("date") ??
    new Date().toLocaleDateString("en-CA");
  const range = parseRange(request.nextUrl.searchParams.get("range"));

  // Load current + prior window (2× range) so deltas can compare periods.
  const window = await loadSnapshots(userId, date, range * 2);

  const dates = window.map((s) => s.date);
  const checkIns = dates.length
    ? await db.checkIn.findMany({ where: { userId, date: { in: dates } } })
    : [];
  const checkInMap = new Map(checkIns.map((c) => [c.date, c]));

  // Per-day readiness (leave-one-out baseline, matching the weekly route).
  const allPoints: TrendPoint[] = window.map((s, i) => {
    const prior = window.filter((_, j) => j !== i);
    const { baseline } = computeBaseline(prior, s);
    const raw = checkInMap.get(s.date);
    const checkIn: CheckInData | null = raw
      ? {
          date: raw.date,
          energyLevel: raw.energyLevel,
          stressLevel: raw.stressLevel,
          sleepQuality: raw.sleepQuality,
          motivation: raw.motivation,
        }
      : null;

    const hasAnyData =
      s.sleepMinutes !== null ||
      s.restingHr !== null ||
      s.hrv !== null ||
      s.steps !== null;

    let score: number | null = null;
    let dayType: TrendPoint["dayType"] = null;
    if (hasAnyData || checkIn) {
      const r = computeReadiness(s, baseline, checkIn, { date: s.date });
      score = r.score;
      dayType = r.dayType;
    }

    return {
      date: s.date,
      score,
      dayType,
      sleepMinutes: s.sleepMinutes,
      hrv: s.hrv,
      restingHr: s.restingHr,
    };
  });

  const currentPoints = allPoints.slice(-range);
  const priorPoints = allPoints.slice(0, Math.max(0, allPoints.length - range));

  const averages = statsOf(currentPoints);
  const prior = statsOf(priorPoints);
  const hasPrior = priorPoints.length > 0;

  const current: TrendStats = {
    readiness: lastNonNull(currentPoints.map((p) => p.score)),
    sleepMinutes: lastNonNull(currentPoints.map((p) => p.sleepMinutes)),
    hrv: lastNonNull(currentPoints.map((p) => p.hrv)),
    restingHr: lastNonNull(currentPoints.map((p) => p.restingHr)),
  };

  const deltas: TrendStats = {
    readiness: delta(averages.readiness, prior.readiness),
    sleepMinutes: delta(averages.sleepMinutes, prior.sleepMinutes),
    hrv: delta(averages.hrv, prior.hrv),
    restingHr: delta(averages.restingHr, prior.restingHr),
  };

  const response: TrendsResponse = {
    range,
    points: currentPoints,
    current,
    averages,
    prior,
    deltas,
    hasPrior,
    insight: buildInsight(range, deltas, hasPrior, currentPoints),
  };

  return NextResponse.json(response);
}
