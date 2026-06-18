/**
 * History aggregation helpers.
 *
 * Pure functions that merge Prisma rows from CheckIn, Reflection,
 * WorkoutSession, DailyHealthSnapshot, and ScoreAudit into the
 * HistoryDaySummary / HistoryDayDetail types.
 *
 * No HTTP, no auth — all logic is in the API route.
 */

import type {
  HistoryDaySummary,
  HistoryDayDetail,
  HistoryMonthStats,
  HistoryWorkout,
} from "@/types/history";

// ─── Row shapes (Prisma returns) ─────────────────────────────────────────────

interface CheckInRow {
  date:         string;
  energyLevel:  number;
  stressLevel:  number;
  sleepQuality: number;
  motivation:   number;
}

interface ReflectionRow {
  date:     string;
  accuracy: string;
  outcome:  string;
  note:     string | null;
}

interface WorkoutRow {
  id:              string;
  date:            string;
  typeLabel:       string;
  durationMinutes: number;
  rpe:             number | null;
  sessionLoad:     number | null;
}

interface SnapshotRow {
  date:            string;
  sleepMinutes:    number | null;
  sleepDeepMin:    number | null;
  sleepRemMin:     number | null;
  sleepEfficiency: number | null;
  hrv:             number | null;
  restingHr:       number | null;
  steps:           number | null;
  totalCalories:   number | null;
}

interface AuditRow {
  date:             string;
  score:            number;
  dayType:          string;
  method:           string;
  dataCompleteness: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** All unique dates that have at least one manual log. */
export function manualDates(
  checkIns:    CheckInRow[],
  reflections: ReflectionRow[],
  workouts:    WorkoutRow[],
): Set<string> {
  const s = new Set<string>();
  checkIns.forEach((r)    => s.add(r.date));
  reflections.forEach((r) => s.add(r.date));
  workouts.forEach((r)    => s.add(r.date));
  return s;
}

/** Build a HistoryDaySummary for one date from pre-indexed maps. */
export function buildDaySummary(
  date:          string,
  checkInMap:    Map<string, CheckInRow>,
  reflectionMap: Map<string, ReflectionRow>,
  workoutMap:    Map<string, WorkoutRow[]>,
  auditMap:      Map<string, AuditRow>,
): HistoryDaySummary {
  const reflection = reflectionMap.get(date) ?? null;
  const audit      = auditMap.get(date)      ?? null;

  return {
    date,
    hasCheckIn:    checkInMap.has(date),
    hasReflection: reflectionMap.has(date),
    workoutCount:  (workoutMap.get(date) ?? []).length,

    dayType:        (audit?.dayType as HistoryDaySummary["dayType"]) ?? null,
    readinessScore: audit ? Math.round(audit.score) : null,
    confidence:     null, // not stored in compact summary (see detail)

    reflectionAccuracy: (reflection?.accuracy as HistoryDaySummary["reflectionAccuracy"]) ?? null,
    reflectionOutcome:  (reflection?.outcome  as HistoryDaySummary["reflectionOutcome"])  ?? null,
  };
}

/** Build the full HistoryDayDetail for one date. */
export function buildDayDetail(
  date:          string,
  checkInMap:    Map<string, CheckInRow>,
  reflectionMap: Map<string, ReflectionRow>,
  workoutMap:    Map<string, WorkoutRow[]>,
  snapshotMap:   Map<string, SnapshotRow>,
  auditMap:      Map<string, AuditRow>,
): HistoryDayDetail {
  const summary   = buildDaySummary(date, checkInMap, reflectionMap, workoutMap, auditMap);
  const checkIn   = checkInMap.get(date)    ?? null;
  const reflection = reflectionMap.get(date) ?? null;
  const rows       = workoutMap.get(date)   ?? [];
  const snapshot   = snapshotMap.get(date)  ?? null;
  const audit      = auditMap.get(date)     ?? null;

  const workouts: HistoryWorkout[] = rows.map((r) => ({
    id:              r.id,
    typeLabel:       r.typeLabel,
    durationMinutes: r.durationMinutes,
    rpe:             r.rpe ?? 0,
    sessionLoad:     r.sessionLoad ?? 0,
  }));

  return {
    ...summary,
    checkIn: checkIn
      ? {
          energyLevel:  checkIn.energyLevel,
          stressLevel:  checkIn.stressLevel,
          sleepQuality: checkIn.sleepQuality,
          motivation:   checkIn.motivation,
        }
      : null,
    reflection: reflection
      ? {
          accuracy: reflection.accuracy as "yes" | "somewhat" | "no",
          outcome:  reflection.outcome  as "great" | "good" | "skipped" | "rest",
          note:     reflection.note,
        }
      : null,
    workouts,
    snapshot: snapshot
      ? {
          sleepMinutes:    snapshot.sleepMinutes,
          sleepDeepMin:    snapshot.sleepDeepMin,
          sleepRemMin:     snapshot.sleepRemMin,
          sleepEfficiency: snapshot.sleepEfficiency,
          hrv:             snapshot.hrv,
          restingHr:       snapshot.restingHr,
          steps:           snapshot.steps,
          totalCalories:   snapshot.totalCalories,
        }
      : null,
    scoreAudit: audit
      ? {
          score:            Math.round(audit.score),
          dayType:          audit.dayType,
          method:           audit.method,
          dataCompleteness: audit.dataCompleteness,
        }
      : null,
  };
}

/** Compute month-level stats from the day summaries. */
export function buildMonthStats(days: HistoryDaySummary[]): HistoryMonthStats {
  return {
    reflectionsSubmitted: days.filter((d) => d.hasReflection).length,
    checkInsSubmitted:    days.filter((d) => d.hasCheckIn).length,
    workoutsLogged:       days.reduce((s, d) => s + d.workoutCount, 0),
    accuracyYes:          days.filter((d) => d.reflectionAccuracy === "yes").length,
    accuracySomewhat:     days.filter((d) => d.reflectionAccuracy === "somewhat").length,
    accuracyNo:           days.filter((d) => d.reflectionAccuracy === "no").length,
  };
}

/** Convert Prisma arrays into lookup maps. Workouts grouped by date. */
export function buildMaps(
  checkIns:    CheckInRow[],
  reflections: ReflectionRow[],
  workouts:    WorkoutRow[],
  snapshots:   SnapshotRow[],
  audits:      AuditRow[],
) {
  return {
    checkInMap:    new Map(checkIns.map((r)    => [r.date, r])),
    reflectionMap: new Map(reflections.map((r) => [r.date, r])),
    workoutMap:    workouts.reduce((m, r) => {
      const list = m.get(r.date) ?? [];
      list.push(r);
      m.set(r.date, list);
      return m;
    }, new Map<string, WorkoutRow[]>()),
    snapshotMap:   new Map(snapshots.map((r)  => [r.date, r])),
    auditMap:      new Map(audits.map((r)     => [r.date, r])),
  };
}
