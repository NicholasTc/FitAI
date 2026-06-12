/**
 * GET /api/weekly — aggregated 7-day summary for the weekly view.
 *
 * Returns:
 *  - dayBreakdown: count of push/maintain/recover days
 *  - averages: sleep, HRV, RHR, steps across the week
 *  - reflections: accuracy stats for the week
 *  - history: per-day detail for the table
 */

import { auth } from "@/lib/auth";
import { computeBaseline } from "@/lib/baseline";
import { computeReadiness } from "@/lib/readiness";
import { loadSnapshots } from "@/lib/sync";
import { db } from "@/lib/db";
import type { CheckInData, DayType } from "@/types/today";
import type { DailySnapshot } from "@/types/snapshot";
import { type NextRequest, NextResponse } from "next/server";

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round(v: number | null, dp = 0): number | null {
  if (v === null) return null;
  return Math.round(v * 10 ** dp) / 10 ** dp;
}

const NULL_SNAPSHOT = (date: string): DailySnapshot => ({
  date,
  sleepMinutes: null,
  sleepEfficiency: null,
  sleepDeepMin: null,
  sleepRemMin: null,
  sleepLightMin: null,
  restingHr: null,
  hrv: null,
  steps: null,
  activeMinutes: null,
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date =
    request.nextUrl.searchParams.get("date") ??
    new Date().toLocaleDateString("en-CA");

  // Load last 7 days of health snapshots
  const history = await loadSnapshots(session.user.id, date, 7);

  // Load check-ins and reflections for the week
  const dates = history.map((s) => s.date);
  const [checkIns, reflections] = await Promise.all([
    db.checkIn.findMany({
      where: { userId: session.user.id, date: { in: dates } },
    }),
    db.reflection.findMany({
      where: { userId: session.user.id, date: { in: dates } },
    }),
  ]);

  const checkInMap = new Map(checkIns.map((c) => [c.date, c]));
  const reflectionMap = new Map(reflections.map((r) => [r.date, r]));

  // Compute day type per day
  const dayRows = history.map((s, i) => {
    const prior = history.filter((_, j) => j !== i);
    const { baseline } = computeBaseline(prior, s);
    const rawCheckIn = checkInMap.get(s.date);
    const checkIn: CheckInData | null = rawCheckIn
      ? {
          date: rawCheckIn.date,
          energyLevel: rawCheckIn.energyLevel,
          stressLevel: rawCheckIn.stressLevel,
          sleepQuality: rawCheckIn.sleepQuality,
          motivation: rawCheckIn.motivation,
        }
      : null;
    const today = history.find((h) => h.date === s.date) ?? NULL_SNAPSHOT(s.date);
    const { dayType, score } = computeReadiness(today, baseline, checkIn);
    const reflection = reflectionMap.get(s.date) ?? null;

    return {
      date: s.date,
      dayType: dayType as DayType,
      score,
      sleepMinutes: s.sleepMinutes,
      hrv: s.hrv,
      restingHr: s.restingHr,
      steps: s.steps,
      hasCheckIn: !!checkIn,
      reflection: reflection
        ? {
            accuracy: reflection.accuracy,
            outcome: reflection.outcome,
            note: reflection.note ?? null,
          }
        : null,
    };
  });

  // Day type breakdown
  const dayBreakdown = {
    push: dayRows.filter((d) => d.dayType === "push").length,
    maintain: dayRows.filter((d) => d.dayType === "maintain").length,
    recover: dayRows.filter((d) => d.dayType === "recover").length,
  };

  // Averages
  const averages = {
    sleepMinutes: round(avg(dayRows.map((d) => d.sleepMinutes))),
    hrv: round(avg(dayRows.map((d) => d.hrv)), 1),
    restingHr: round(avg(dayRows.map((d) => d.restingHr)), 1),
    steps: round(avg(dayRows.map((d) => d.steps))),
    readinessScore: round(avg(dayRows.map((d) => d.score))),
  };

  // Reflection accuracy stats
  const withReflection = dayRows.filter((d) => d.reflection);
  const accuracyStats = {
    total: withReflection.length,
    yes: withReflection.filter((d) => d.reflection?.accuracy === "yes").length,
    somewhat: withReflection.filter((d) => d.reflection?.accuracy === "somewhat").length,
    no: withReflection.filter((d) => d.reflection?.accuracy === "no").length,
  };

  return NextResponse.json({
    weekOf: date,
    dayBreakdown,
    averages,
    accuracyStats,
    history: dayRows,
  });
}
