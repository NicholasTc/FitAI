/**
 * Sync layer — fetches health snapshots from Google Health API
 * and upserts them into the local database.
 *
 * Call syncUserHealth() on dashboard load (snapshots + workouts, one job).
 * Already-synced days are upserted (not duplicated) via the unique [userId, date] index.
 */

import { db } from "@/lib/db";
import { fetchSnapshotsForDates, fetchRecentWorkouts } from "@/lib/health";
import type { WorkoutSession } from "@/lib/health";
import {
  logGoogleHealthGateSummary,
} from "@/lib/googleHealth/rateLimiter";
import {
  GOOGLE_HEALTH_LOG_PREFIX,
  GOOGLE_HEALTH_SYNC,
} from "@/lib/googleHealth/config";
import {
  homeSyncCooldownRemainingMs,
  markHomeSyncAttempt,
} from "@/lib/googleHealth/homeCooldown";
import { runExclusiveUserSync } from "@/lib/googleHealth/syncLock";
import type { DailyHealthSnapshotModel } from "@/lib/generated/prisma/models/DailyHealthSnapshot";
import type { WorkoutSessionModel } from "@/lib/generated/prisma/models/WorkoutSession";
import type { DailySnapshot } from "@/types/snapshot";

const SYNC_DAYS = 7;
export const MAX_BACKFILL_DAYS = 90;

export type SnapshotSyncResult = {
  apiError: string | null;
  /** Days actually fetched from Google Health this run. */
  daysSynced: number;
  /** Days skipped because DB data was still fresh. */
  daysSkipped: number;
  daysWithAnyData: number;
  /** True when Home cooldown skipped the sync job entirely. */
  skippedDueToCooldown?: boolean;
};

function subtractDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function windowDates(today: string, days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(subtractDays(today, i));
  }
  return dates;
}

function rowHasUsefulData(row: {
  sleepMinutes: number | null;
  restingHr: number | null;
  hrv: number | null;
  steps: number | null;
  totalCalories: number | null;
}): boolean {
  return (
    row.sleepMinutes !== null ||
    row.restingHr !== null ||
    row.hrv !== null ||
    row.steps !== null ||
    row.totalCalories !== null
  );
}

/**
 * True when we can skip a Google fetch for this day.
 * - Today: time-based only (metrics keep updating through the day).
 * - Past days: must be within TTL *and* have useful stored data
 *   (empty past rows are retried — overnight Fitbit lag).
 */
function isSnapshotFresh(
  row: {
    syncedAt: Date;
    sleepMinutes: number | null;
    restingHr: number | null;
    hrv: number | null;
    steps: number | null;
    totalCalories: number | null;
  } | undefined,
  date: string,
  today: string,
  nowMs: number,
): boolean {
  if (!row) return false;

  const ageMs = nowMs - row.syncedAt.getTime();
  const ttl =
    date === today
      ? GOOGLE_HEALTH_SYNC.todayFreshnessMs
      : GOOGLE_HEALTH_SYNC.pastDayFreshnessMs;

  if (ageMs > ttl) return false;
  if (date !== today && !rowHasUsefulData(row)) return false;
  return true;
}

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
      sleepAwakeMin: snapshot.sleepAwakeMin,
      restingHr: snapshot.restingHr,
      hrv: snapshot.hrv,
      steps: snapshot.steps,
      activeMinutes: snapshot.activeMinutes,
      totalCalories: snapshot.totalCalories,
      fatBurnMin: snapshot.fatBurnMin,
      cardioMin: snapshot.cardioMin,
      peakMin: snapshot.peakMin,
      zoneLightMin: snapshot.zoneLightMin,
      zoneModerateMin: snapshot.zoneModerateMin,
      zoneVigorousMin: snapshot.zoneVigorousMin,
      zonePeakMin: snapshot.zonePeakMin,
      zoneLightMinBpm: snapshot.zoneLightMinBpm,
      zoneLightMaxBpm: snapshot.zoneLightMaxBpm,
      zoneModerateMinBpm: snapshot.zoneModerateMinBpm,
      zoneModerateMaxBpm: snapshot.zoneModerateMaxBpm,
      zoneVigorousMinBpm: snapshot.zoneVigorousMinBpm,
      zoneVigorousMaxBpm: snapshot.zoneVigorousMaxBpm,
      zonePeakMinBpm: snapshot.zonePeakMinBpm,
      zonePeakMaxBpm: snapshot.zonePeakMaxBpm,
    },
    update: {
      sleepMinutes: nz(snapshot.sleepMinutes),
      sleepEfficiency: nz(snapshot.sleepEfficiency),
      sleepDeepMin: nz(snapshot.sleepDeepMin),
      sleepRemMin: nz(snapshot.sleepRemMin),
      sleepLightMin: nz(snapshot.sleepLightMin),
      sleepAwakeMin: nz(snapshot.sleepAwakeMin),
      restingHr: nz(snapshot.restingHr),
      hrv: nz(snapshot.hrv),
      steps: nz(snapshot.steps),
      activeMinutes: nz(snapshot.activeMinutes),
      totalCalories: nz(snapshot.totalCalories),
      fatBurnMin: nz(snapshot.fatBurnMin),
      cardioMin: nz(snapshot.cardioMin),
      peakMin: nz(snapshot.peakMin),
      zoneLightMin: nz(snapshot.zoneLightMin),
      zoneModerateMin: nz(snapshot.zoneModerateMin),
      zoneVigorousMin: nz(snapshot.zoneVigorousMin),
      zonePeakMin: nz(snapshot.zonePeakMin),
      zoneLightMinBpm: nz(snapshot.zoneLightMinBpm),
      zoneLightMaxBpm: nz(snapshot.zoneLightMaxBpm),
      zoneModerateMinBpm: nz(snapshot.zoneModerateMinBpm),
      zoneModerateMaxBpm: nz(snapshot.zoneModerateMaxBpm),
      zoneVigorousMinBpm: nz(snapshot.zoneVigorousMinBpm),
      zoneVigorousMaxBpm: nz(snapshot.zoneVigorousMaxBpm),
      zonePeakMinBpm: nz(snapshot.zonePeakMinBpm),
      zonePeakMaxBpm: nz(snapshot.zonePeakMaxBpm),
    },
  });
}

async function syncUserSnapshotsUnlocked(
  userId: string,
  accessToken: string,
  today: string,
  days: number,
): Promise<SnapshotSyncResult> {
  const dates = windowDates(today, days);
  const existing = await db.dailyHealthSnapshot.findMany({
    where: { userId, date: { in: dates } },
    select: {
      date: true,
      syncedAt: true,
      sleepMinutes: true,
      restingHr: true,
      hrv: true,
      steps: true,
      totalCalories: true,
      fatBurnMin: true,
      cardioMin: true,
      peakMin: true,
      zoneLightMin: true,
      zoneModerateMin: true,
      zoneVigorousMin: true,
      zonePeakMin: true,
    },
  });
  const byDate = new Map(existing.map((r) => [r.date, r]));
  const nowMs = Date.now();

  // Zone columns are new — force a re-fetch while zone minutes are still all-null
  // so we don't sit on a "fresh" snapshot that predates AZM ingestion.
  const missingZones = (row: {
    fatBurnMin: number | null;
    cardioMin: number | null;
    peakMin: number | null;
  } | undefined) =>
    !!row &&
    row.fatBurnMin === null &&
    row.cardioMin === null &&
    row.peakMin === null;

  // Same rule for the Karvonen zones (daily-heart-rate-zones /
  // time-in-heart-rate-zone) — a row can already have AZM but still predate
  // this ingestion, so this is checked independently of missingZones.
  const missingKarvonenZones = (row: {
    zoneLightMin: number | null;
    zoneModerateMin: number | null;
    zoneVigorousMin: number | null;
    zonePeakMin: number | null;
  } | undefined) =>
    !!row &&
    row.zoneLightMin === null &&
    row.zoneModerateMin === null &&
    row.zoneVigorousMin === null &&
    row.zonePeakMin === null;

  const staleDates = dates.filter((d) => {
    const row = byDate.get(d);
    if (missingZones(row) || missingKarvonenZones(row)) return true;
    return !isSnapshotFresh(row, d, today, nowMs);
  });
  const daysSkipped = dates.length - staleDates.length;

  if (daysSkipped > 0) {
    console.info(
      `${GOOGLE_HEALTH_LOG_PREFIX} skip-fresh user=${userId} ` +
        `skipped=${daysSkipped} fetch=${staleDates.length} window=${days} ` +
        `todayTtlMs=${GOOGLE_HEALTH_SYNC.todayFreshnessMs} ` +
        `pastTtlMs=${GOOGLE_HEALTH_SYNC.pastDayFreshnessMs}`,
    );
  }

  let apiError: string | null = null;
  if (staleDates.length > 0) {
    const fetched = await fetchSnapshotsForDates(
      userId,
      accessToken,
      staleDates,
      today,
    );
    apiError = fetched.apiError;
    await Promise.all(fetched.snapshots.map((s) => upsertSnapshot(userId, s)));
  }

  const after = await db.dailyHealthSnapshot.findMany({
    where: { userId, date: { in: dates } },
    select: {
      sleepMinutes: true,
      restingHr: true,
      hrv: true,
      steps: true,
      totalCalories: true,
    },
  });
  const daysWithAnyData = after.filter(rowHasUsefulData).length;

  if (apiError) {
    console.warn(
      `${GOOGLE_HEALTH_LOG_PREFIX} sync-failed context=snapshots user=${userId} ` +
        `days=${days} fetched=${staleDates.length} error=${apiError}`,
    );
  }

  return {
    apiError,
    daysSynced: staleDates.length,
    daysSkipped,
    daysWithAnyData,
  };
}

/**
 * Sync recent snapshots from Google Health API.
 * Single-flight + deduped per user for identical (today, days) jobs.
 * @param days — how many days back to fetch (default 7, max 90 for history backfill)
 */
export async function syncUserSnapshots(
  userId: string,
  accessToken: string,
  today: string,
  days = SYNC_DAYS,
): Promise<SnapshotSyncResult> {
  const safeDays = Math.min(days, MAX_BACKFILL_DAYS);
  const jobKey = `snapshots:${today}:${safeDays}`;

  return runExclusiveUserSync(userId, jobKey, async () => {
    const result = await syncUserSnapshotsUnlocked(
      userId,
      accessToken,
      today,
      safeDays,
    );
    logGoogleHealthGateSummary(userId, jobKey);
    return result;
  });
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
        endTime: w.endTime,
        typeLabel: w.typeLabel,
        typeRaw: w.typeRaw,
        durationMinutes: w.durationMinutes,
        source: w.source,
      },
    });
  } else {
    await db.workoutSession.create({
      data: {
        userId,
        startTime: w.startTime,
        endTime: w.endTime,
        date: w.date,
        typeLabel: w.typeLabel,
        typeRaw: w.typeRaw,
        durationMinutes: w.durationMinutes,
        source: w.source,
        isManual: false,
      },
    });
  }
}

async function syncUserWorkoutsUnlocked(
  userId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const workouts = await fetchRecentWorkouts(
    userId,
    accessToken,
    startDate,
    endDate,
  );
  await Promise.all(workouts.map((w) => upsertWorkout(userId, w)));
}

/**
 * Sync workout sessions for a date range.
 * Queues behind any other active sync for this user.
 */
export async function syncUserWorkouts(
  userId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const jobKey = `workouts:${startDate}:${endDate}`;
  return runExclusiveUserSync(userId, jobKey, async () => {
    await syncUserWorkoutsUnlocked(userId, accessToken, startDate, endDate);
    logGoogleHealthGateSummary(userId, jobKey);
  });
}

export async function snapshotWindowStats(
  userId: string,
  today: string,
  days: number,
): Promise<{ daysWithAnyData: number; dayCount: number }> {
  const dates = windowDates(today, days);
  const rows = await db.dailyHealthSnapshot.findMany({
    where: { userId, date: { in: dates } },
    select: {
      sleepMinutes: true,
      restingHr: true,
      hrv: true,
      steps: true,
      totalCalories: true,
    },
  });
  return {
    dayCount: dates.length,
    daysWithAnyData: rows.filter(rowHasUsefulData).length,
  };
}

/**
 * Dashboard / Home sync: today's readiness snapshots first, then workouts.
 * Honors homeSyncCooldownMs so tab spam does not start another Google pull.
 * One exclusive job so double page refresh joins the same Promise.
 *
 * Explicit History sync should use `syncUserSnapshots` (no Home cooldown).
 */
export async function syncUserHealth(
  userId: string,
  accessToken: string,
  today: string,
  days = SYNC_DAYS,
): Promise<SnapshotSyncResult> {
  const safeDays = Math.min(days, MAX_BACKFILL_DAYS);

  // Bypass Home cooldown when today's zone minutes were never ingested —
  // otherwise a recent pre-AZM (or pre-Karvonen-zone) sync would block the
  // fix for up to 5 minutes.
  const todayZones = await db.dailyHealthSnapshot.findUnique({
    where: { userId_date: { userId, date: today } },
    select: {
      fatBurnMin: true,
      cardioMin: true,
      peakMin: true,
      zoneLightMin: true,
      zoneModerateMin: true,
      zoneVigorousMin: true,
      zonePeakMin: true,
    },
  });
  const needsZoneBackfill =
    !!todayZones &&
    ((todayZones.fatBurnMin === null &&
      todayZones.cardioMin === null &&
      todayZones.peakMin === null) ||
      (todayZones.zoneLightMin === null &&
        todayZones.zoneModerateMin === null &&
        todayZones.zoneVigorousMin === null &&
        todayZones.zonePeakMin === null));

  const cooldownMs = needsZoneBackfill
    ? 0
    : await homeSyncCooldownRemainingMs(userId, today);
  if (cooldownMs > 0) {
    const stats = await snapshotWindowStats(userId, today, safeDays);
    console.info(
      `${GOOGLE_HEALTH_LOG_PREFIX} skip-cooldown user=${userId} today=${today} ` +
        `remainingMs=${cooldownMs} window=${safeDays}`,
    );
    return {
      apiError: null,
      daysSynced: 0,
      daysSkipped: stats.dayCount,
      daysWithAnyData: stats.daysWithAnyData,
      skippedDueToCooldown: true,
    };
  }

  const windowStart = new Date(`${today}T00:00:00`);
  windowStart.setDate(windowStart.getDate() - (safeDays - 1));
  const syncSince = windowStart.toISOString().slice(0, 10);
  const jobKey = `health:${today}:${safeDays}`;

  return runExclusiveUserSync(userId, jobKey, async () => {
    // Another Home request may have finished while we waited for the lock.
    const againMs = needsZoneBackfill
      ? 0
      : await homeSyncCooldownRemainingMs(userId, today);
    if (againMs > 0) {
      const stats = await snapshotWindowStats(userId, today, safeDays);
      console.info(
        `${GOOGLE_HEALTH_LOG_PREFIX} skip-cooldown user=${userId} today=${today} ` +
          `remainingMs=${againMs} reason=after-wait`,
      );
      return {
        apiError: null,
        daysSynced: 0,
        daysSkipped: stats.dayCount,
        daysWithAnyData: stats.daysWithAnyData,
        skippedDueToCooldown: true,
      };
    }

    // Snapshots (today/core first inside fetch) before workouts.
    const result = await syncUserSnapshotsUnlocked(
      userId,
      accessToken,
      today,
      safeDays,
    );
    // If every day was fresh, skip the workout API call too (same short window).
    if (result.daysSynced > 0) {
      await syncUserWorkoutsUnlocked(userId, accessToken, syncSince, today);
    } else {
      console.info(
        `${GOOGLE_HEALTH_LOG_PREFIX} skip-workouts user=${userId} reason=snapshots-fresh`,
      );
    }

    markHomeSyncAttempt(userId, today);
    logGoogleHealthGateSummary(userId, jobKey);
    return result;
  });
}

/**
 * Load the most recent workout for a user within the last N days.
 * Returns null if none found.
 */
export async function loadLastWorkout(
  userId: string,
  sinceDate: string,
): Promise<WorkoutSession | null> {
  const row = (await db.workoutSession.findFirst({
    where: { userId, date: { gte: sinceDate } },
    orderBy: { date: "desc" },
  })) as WorkoutSessionModel | null;

  if (!row) return null;

  return {
    startTime: row.startTime ?? row.date + "T00:00:00Z",
    endTime: row.endTime ?? row.date + "T01:00:00Z",
    date: row.date,
    typeLabel: row.typeLabel,
    typeRaw: row.typeRaw ?? row.typeLabel,
    durationMinutes: row.durationMinutes,
    source: row.source,
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
    sleepAwakeMin: r.sleepAwakeMin ?? null,
    restingHr: r.restingHr,
    hrv: r.hrv,
    steps: r.steps,
    activeMinutes: r.activeMinutes,
    totalCalories: r.totalCalories,
    fatBurnMin: r.fatBurnMin ?? null,
    cardioMin: r.cardioMin ?? null,
    peakMin: r.peakMin ?? null,
    zoneLightMin: r.zoneLightMin ?? null,
    zoneModerateMin: r.zoneModerateMin ?? null,
    zoneVigorousMin: r.zoneVigorousMin ?? null,
    zonePeakMin: r.zonePeakMin ?? null,
    zoneLightMinBpm: r.zoneLightMinBpm ?? null,
    zoneLightMaxBpm: r.zoneLightMaxBpm ?? null,
    zoneModerateMinBpm: r.zoneModerateMinBpm ?? null,
    zoneModerateMaxBpm: r.zoneModerateMaxBpm ?? null,
    zoneVigorousMinBpm: r.zoneVigorousMinBpm ?? null,
    zoneVigorousMaxBpm: r.zoneVigorousMaxBpm ?? null,
    zonePeakMinBpm: r.zonePeakMinBpm ?? null,
    zonePeakMaxBpm: r.zonePeakMaxBpm ?? null,
  }));
}
