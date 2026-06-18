/**
 * GET /api/history
 *
 * Three modes selected by query params:
 *
 *   ?month=YYYY-MM          — all days with manual activity in that calendar month
 *   ?date=YYYY-MM-DD        — full detail for one day
 *   ?bounds=true            — earliest and latest dates across all manual logs
 *
 * Manual logs = CheckIn + Reflection + WorkoutSession (isManual=true).
 * Wearable data (DailyHealthSnapshot) and ScoreAudit are secondary context.
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildDayDetail, buildDaySummary, buildMaps, buildMonthStats, manualDates } from "@/lib/history";
import type { HistoryBoundsResponse, HistoryMonthResponse } from "@/types/history";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { searchParams } = request.nextUrl;

  // ── BOUNDS ──────────────────────────────────────────────────────────────────
  if (searchParams.get("bounds") === "true") {
    const [minCheckIn, maxCheckIn, minReflection, maxReflection, minWorkout, maxWorkout] =
      await Promise.all([
        db.checkIn.findFirst({ where: { userId }, orderBy: { date: "asc" },  select: { date: true } }),
        db.checkIn.findFirst({ where: { userId }, orderBy: { date: "desc" }, select: { date: true } }),
        db.reflection.findFirst({ where: { userId }, orderBy: { date: "asc" },  select: { date: true } }),
        db.reflection.findFirst({ where: { userId }, orderBy: { date: "desc" }, select: { date: true } }),
        db.workoutSession.findFirst({ where: { userId, isManual: true }, orderBy: { date: "asc" },  select: { date: true } }),
        db.workoutSession.findFirst({ where: { userId, isManual: true }, orderBy: { date: "desc" }, select: { date: true } }),
      ]);

    const candidates = [
      minCheckIn?.date, minReflection?.date, minWorkout?.date,
    ].filter(Boolean) as string[];
    const maxCandidates = [
      maxCheckIn?.date, maxReflection?.date, maxWorkout?.date,
    ].filter(Boolean) as string[];

    const bounds: HistoryBoundsResponse = {
      earliestDate: candidates.length ? candidates.sort()[0] : null,
      latestDate:   maxCandidates.length ? maxCandidates.sort().at(-1)! : null,
    };
    return NextResponse.json(bounds);
  }

  // ── DAY DETAIL ───────────────────────────────────────────────────────────────
  const dateParam = searchParams.get("date");
  if (dateParam) {
    const [checkIns, reflections, workouts, snapshots, audits] = await Promise.all([
      db.checkIn.findMany({ where: { userId, date: dateParam } }),
      db.reflection.findMany({ where: { userId, date: dateParam } }),
      db.workoutSession.findMany({ where: { userId, isManual: true, date: dateParam }, orderBy: { createdAt: "asc" } }),
      db.dailyHealthSnapshot.findMany({ where: { userId, date: dateParam } }),
      db.scoreAudit.findMany({ where: { userId, date: dateParam } }),
    ]);

    const { checkInMap, reflectionMap, workoutMap, snapshotMap, auditMap } =
      buildMaps(checkIns, reflections, workouts, snapshots, audits);

    const detail = buildDayDetail(
      dateParam,
      checkInMap, reflectionMap, workoutMap, snapshotMap, auditMap,
    );
    return NextResponse.json(detail);
  }

  // ── MONTH GRID ───────────────────────────────────────────────────────────────
  const monthParam = searchParams.get("month"); // YYYY-MM
  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json(
      { error: "Provide ?month=YYYY-MM, ?date=YYYY-MM-DD, or ?bounds=true" },
      { status: 400 },
    );
  }

  const monthStart = `${monthParam}-01`;
  // Last day of month: first day of next month minus 1
  const [year, mon] = monthParam.split("-").map(Number);
  const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
  const d = new Date(nextMonth);
  d.setDate(d.getDate() - 1);
  const monthEnd = d.toISOString().slice(0, 10);

  // Parallel DB fetch for this month
  const [checkIns, reflections, workouts, snapshots, audits] = await Promise.all([
    db.checkIn.findMany({ where: { userId, date: { gte: monthStart, lte: monthEnd } } }),
    db.reflection.findMany({ where: { userId, date: { gte: monthStart, lte: monthEnd } } }),
    db.workoutSession.findMany({ where: { userId, isManual: true, date: { gte: monthStart, lte: monthEnd } }, orderBy: { date: "asc" } }),
    db.dailyHealthSnapshot.findMany({ where: { userId, date: { gte: monthStart, lte: monthEnd } } }),
    db.scoreAudit.findMany({ where: { userId, date: { gte: monthStart, lte: monthEnd } } }),
  ]);

  const { checkInMap, reflectionMap, workoutMap, snapshotMap, auditMap } =
    buildMaps(checkIns, reflections, workouts, snapshots, audits);

  // Union all dates with manual activity
  const activeDates = manualDates(checkIns, reflections, workouts);

  // Also fetch global bounds for navigation
  const [minRow, maxRow] = await Promise.all([
    db.checkIn.findFirst({ where: { userId }, orderBy: { date: "asc" }, select: { date: true } })
      .then(async (r) => {
        if (!r) {
          const rr = await db.reflection.findFirst({ where: { userId }, orderBy: { date: "asc" }, select: { date: true } });
          if (!rr) return db.workoutSession.findFirst({ where: { userId, isManual: true }, orderBy: { date: "asc" }, select: { date: true } });
          return rr;
        }
        return r;
      }),
    db.checkIn.findFirst({ where: { userId }, orderBy: { date: "desc" }, select: { date: true } })
      .then(async (r) => {
        if (!r) {
          const rr = await db.reflection.findFirst({ where: { userId }, orderBy: { date: "desc" }, select: { date: true } });
          if (!rr) return db.workoutSession.findFirst({ where: { userId, isManual: true }, orderBy: { date: "desc" }, select: { date: true } });
          return rr;
        }
        return r;
      }),
  ]);

  // Build sorted day summaries for active dates only
  const days = Array.from(activeDates)
    .sort()
    .map((date) => buildDaySummary(date, checkInMap, reflectionMap, workoutMap, auditMap));

  const stats = buildMonthStats(days);

  // Also include wearable-only days that have a ScoreAudit row (opt-in via query param)
  const includeWearableOnly = searchParams.get("includeWearableOnly") === "true";
  let allDays = days;
  if (includeWearableOnly) {
    const auditDates = new Set(audits.map((a) => a.date));
    const wearableOnlyDates = Array.from(auditDates).filter((d) => !activeDates.has(d));
    const extra = wearableOnlyDates
      .sort()
      .map((date) => buildDaySummary(date, checkInMap, reflectionMap, workoutMap, auditMap));
    allDays = [...days, ...extra].sort((a, b) => a.date.localeCompare(b.date));
  }

  const response: HistoryMonthResponse = {
    month:              monthParam,
    earliestManualDate: minRow?.date ?? null,
    latestManualDate:   maxRow?.date ?? null,
    days:               allDays,
    stats,
  };
  return NextResponse.json(response);
}
