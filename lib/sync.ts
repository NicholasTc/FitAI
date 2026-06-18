/**
 * Sync layer — fetches health snapshots from Google Health API
 * and upserts them into the local SQLite database.
 *
 * Call syncUserSnapshots() on every dashboard load to keep data fresh.
 * Already-synced days are upserted (not duplicated) via the unique [userId, date] index.
 */

import { db } from "@/lib/db";
import { fetchRecentSnapshots, fetchRecentWorkouts } from "@/lib/health";
import type { WorkoutSession } from "@/lib/health";
import type { DailyHealthSnapshotModel } from "@/lib/generated/prisma/models/DailyHealthSnapshot";
import type { WorkoutSessionModel } from "@/lib/generated/prisma/models/WorkoutSession";
import type { DailySnapshot } from "@/types/snapshot";

const SYNC_DAYS = 7;
export const MAX_BACKFILL_DAYS = 90;

/**
 * Upsert a single snapshot for a user into the DB.
 */
async function upsertSnapshot(
  userId: string,
  snapshot: DailySnapshot,
): Promise<void> {
  // In the update block, undefined means "leave existing value unchanged".
  // This prevents a null from a failed/empty API response from overwriting
  // a previously stored good value.
  const nz = <T>(v: T | null): T | undefined => (v !== null ? v : undefined);

  await db.dailyHealthSnapshot.upsert({
    where: { userId_date: { userId, date: snapshot.date } },
    create: {
      userId,
      date: snapshot.date,
      sleepMinutes: snapshot.sleepMinutes,
      sleepEfficiency: snapshot.sleepEfficiency,
      sleepDeepMin: snapshot.sleepDeepMin,
      sleepRemMin: snapshot.sleepRemMin,
      sleepLightMin: snapshot.sleepLightMin,
      restingHr: snapshot.restingHr,
      hrv: snapshot.hrv,
      steps: snapshot.steps,
      activeMinutes: snapshot.activeMinutes,
      totalCalories: snapshot.totalCalories,
    },
    update: {
      sleepMinutes: nz(snapshot.sleepMinutes),
      sleepEfficiency: nz(snapshot.sleepEfficiency),
      sleepDeepMin: nz(snapshot.sleepDeepMin),
      sleepRemMin: nz(snapshot.sleepRemMin),
      sleepLightMin: nz(snapshot.sleepLightMin),
      restingHr: nz(snapshot.restingHr),
      hrv: nz(snapshot.hrv),
      steps: nz(snapshot.steps),
      activeMinutes: nz(snapshot.activeMinutes),
      totalCalories: nz(snapshot.totalCalories),
    },
  });
}

/**
 * Sync the last 7 days of health data for a user.
 * Called on each dashboard load.
 */
/**
 * Sync recent snapshots from Google Health API.
 * @param days — how many days back to fetch (default 7, max 90 for history backfill)
 */
export async function syncUserSnapshots(
  userId: string,
  accessToken: string,
  today: string,
  days = SYNC_DAYS,
): Promise<void> {
  const safeDays = Math.min(days, MAX_BACKFILL_DAYS);
  const snapshots = await fetchRecentSnapshots(accessToken, today, safeDays);
  await Promise.all(snapshots.map((s) => upsertSnapshot(userId, s)));
}

/**
 * Upsert a single API-synced workout session for a user.
 * Uses [userId, date, typeRaw] as a soft dedup key via findFirst + create.
 * We lost the @unique([userId, startTime]) when we made startTime optional,
 * so we do an idempotent findFirst → skip-or-create pattern instead.
 */
async function upsertWorkout(userId: string, w: WorkoutSession): Promise<void> {
  const existing = await db.workoutSession.findFirst({
    where: { userId, startTime: w.startTime, isManual: false },
    select: { id: true },
  });
  if (existing) {
    await db.workoutSession.update({
      where: { id: existing.id },
      data: {
        endTime:         w.endTime,
        typeLabel:       w.typeLabel,
        typeRaw:         w.typeRaw,
        durationMinutes: w.durationMinutes,
        source:          w.source,
      },
    });
  } else {
    await db.workoutSession.create({
      data: {
        userId,
        startTime:       w.startTime,
        endTime:         w.endTime,
        date:            w.date,
        typeLabel:       w.typeLabel,
        typeRaw:         w.typeRaw,
        durationMinutes: w.durationMinutes,
        source:          w.source,
        isManual:        false,
      },
    });
  }
}

/**
 * Sync workout sessions from the last 7 days.
 */
export async function syncUserWorkouts(
  userId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const workouts = await fetchRecentWorkouts(accessToken, startDate, endDate);
  await Promise.all(workouts.map((w) => upsertWorkout(userId, w)));
}

/**
 * Load the most recent workout for a user within the last N days.
 * Returns null if none found.
 */
export async function loadLastWorkout(
  userId: string,
  sinceDate: string,
): Promise<WorkoutSession | null> {
  const row = await db.workoutSession.findFirst({
    where: { userId, date: { gte: sinceDate } },
    orderBy: { date: "desc" },
  }) as WorkoutSessionModel | null;

  if (!row) return null;

  return {
    startTime: row.startTime ?? row.date + "T00:00:00Z",
    endTime:   row.endTime   ?? row.date + "T01:00:00Z",
    date:      row.date,
    typeLabel: row.typeLabel,
    typeRaw:   row.typeRaw   ?? row.typeLabel,
    durationMinutes: row.durationMinutes,
    source:    row.source,
  };
}

/**
 * Load the most recent N days of stored snapshots for a user from the DB.
 * Returns oldest → newest (ascending), capped at `today`.
 */
export async function loadSnapshots(
  userId: string,
  today: string,
  days = SYNC_DAYS,
): Promise<DailySnapshot[]> {
  // Fetch desc to get the *most recent* rows, then reverse to oldest→newest.
  const rows = await db.dailyHealthSnapshot.findMany({
    where: { userId, date: { lte: today } },
    orderBy: { date: "desc" },
    take: days,
  });
  rows.reverse();

  return rows.map((r: DailyHealthSnapshotModel) => ({
    date: r.date,
    sleepMinutes: r.sleepMinutes,
    sleepEfficiency: r.sleepEfficiency,
    sleepDeepMin: r.sleepDeepMin,
    sleepRemMin: r.sleepRemMin,
    sleepLightMin: r.sleepLightMin,
    restingHr: r.restingHr,
    hrv: r.hrv,
    steps: r.steps,
    activeMinutes: r.activeMinutes,
    totalCalories: r.totalCalories,
  }));
}
