/**
 * Google Health API client — Phase 2A scope.
 *
 * Tier A (core):  sleep, resting HR, HRV, active minutes
 * Tier B (supporting): steps
 *
 * All other endpoints (SpO2, stress, respiratory rate, sleep temp, profile,
 * distance, total calories, raw heart-rate rollup) are deferred to later phases.
 */

import type { DailySnapshot } from "@/types/snapshot";
import { GOOGLE_HEALTH_SYNC } from "@/lib/googleHealth/config";
import {
  googleHealthFetch,
  type GoogleHealthFetchResult,
} from "@/lib/googleHealth/rateLimiter";

const HEALTH_API_BASE = "https://health.googleapis.com/v4";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCivilDate(dateStr: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function subtractDays(dateStr: string, n: number): string {
  return addDays(dateStr, -n);
}

function formatCivilDate(d?: {
  year?: number;
  month?: number;
  day?: number;
}): string | null {
  if (!d?.year || !d?.month || !d?.day) return null;
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** Inclusive [start, end] windows each spanning at most maxDays. */
function chunkInclusiveRange(
  start: string,
  endInclusive: string,
  maxDays: number,
): Array<{ start: string; endInclusive: string }> {
  const chunks: Array<{ start: string; endInclusive: string }> = [];
  let cursor = start;
  while (cursor <= endInclusive) {
    const chunkEnd = addDays(cursor, maxDays - 1);
    const end = chunkEnd < endInclusive ? chunkEnd : endInclusive;
    chunks.push({ start: cursor, endInclusive: end });
    cursor = addDays(end, 1);
  }
  return chunks;
}

type FetchResult<T = unknown> = GoogleHealthFetchResult<T>;

function okResult<T>(data: T): FetchResult<T> {
  return { ok: true, status: 200, data };
}

// ─── Endpoint helpers (all go through the per-user rate limiter) ───────────────

async function dailyRollUpRange<T = unknown>(
  userId: string,
  accessToken: string,
  dataType: string,
  startDate: string,
  endDateInclusive: string,
): Promise<FetchResult<T>> {
  const endExclusive = addDays(endDateInclusive, 1);
  return googleHealthFetch<T>(
    userId,
    `${HEALTH_API_BASE}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        range: {
          start: { date: parseCivilDate(startDate) },
          end: { date: parseCivilDate(endExclusive) },
        },
        windowSizeDays: 1,
      }),
    },
  );
}

async function dailyRollUp<T = unknown>(
  userId: string,
  accessToken: string,
  dataType: string,
  date: string,
): Promise<FetchResult<T>> {
  return dailyRollUpRange<T>(userId, accessToken, dataType, date, date);
}

async function dailyListRange<T = unknown>(
  userId: string,
  accessToken: string,
  dataType: string,
  filterField: string,
  startDate: string,
  endDateInclusive: string,
): Promise<FetchResult<T>> {
  const endExclusive = addDays(endDateInclusive, 1);
  const filter = `${filterField}.date >= "${startDate}" AND ${filterField}.date < "${endExclusive}"`;
  const params = new URLSearchParams({ filter });
  return googleHealthFetch<T>(
    userId,
    `${HEALTH_API_BASE}/users/me/dataTypes/${dataType}/dataPoints?${params.toString()}`,
    accessToken,
  );
}

async function dailyList<T = unknown>(
  userId: string,
  accessToken: string,
  dataType: string,
  filterField: string,
  date: string,
): Promise<FetchResult<T>> {
  return dailyListRange<T>(
    userId,
    accessToken,
    dataType,
    filterField,
    date,
    date,
  );
}

async function sleepListRange<T = unknown>(
  userId: string,
  accessToken: string,
  startDate: string,
  endDateInclusive: string,
): Promise<FetchResult<T>> {
  const endExclusive = addDays(endDateInclusive, 1);
  const filter = `sleep.interval.civil_end_time >= "${startDate}" AND sleep.interval.civil_end_time < "${endExclusive}"`;
  const params = new URLSearchParams({ filter });
  return googleHealthFetch<T>(
    userId,
    `${HEALTH_API_BASE}/users/me/dataTypes/sleep/dataPoints?${params.toString()}`,
    accessToken,
  );
}

async function sleepList<T = unknown>(
  userId: string,
  accessToken: string,
  date: string,
): Promise<FetchResult<T>> {
  return sleepListRange<T>(userId, accessToken, date, date);
}

// ─── Raw API response shapes (minimal) ───────────────────────────────────────
// Google Health API returns numeric fields as strings over the wire despite
// the JSON spec. Use `number | string` and coerce during normalization.

type Num = number | string | undefined;

interface CivilDateTime {
  date?: { year?: number; month?: number; day?: number };
}

interface StepsRollup {
  rollupDataPoints?: Array<{
    civilStartTime?: CivilDateTime;
    steps?: { countSum?: Num };
  }>;
}

interface SleepStageSummary {
  type?: string; // "DEEP" | "REM" | "LIGHT" | "AWAKE" | "RESTLESS" | "ASLEEP"
  minutes?: Num;
}

interface SleepSummaryFields {
  minutesAsleep?: Num;       // total minutes asleep (LIGHT + REM + DEEP)
  minutesInSleepPeriod?: Num; // full sleep period (for efficiency calc)
  minutesAwake?: Num;
  stagesSummary?: SleepStageSummary[];
}

interface SleepResponse {
  dataPoints?: Array<{
    sleep?: {
      interval?: { civilEndTime?: string };
      summary?: SleepSummaryFields;
    };
  }>;
}

interface RhrResponse {
  dataPoints?: Array<{
    date?: { year?: number; month?: number; day?: number };
    startTime?: CivilDateTime;
    dailyRestingHeartRate?: {
      beatsPerMinute?: Num;
      date?: { year?: number; month?: number; day?: number };
    };
  }>;
}

interface HrvResponse {
  dataPoints?: Array<{
    date?: { year?: number; month?: number; day?: number };
    startTime?: CivilDateTime;
    dailyHeartRateVariability?: {
      averageHeartRateVariabilityMilliseconds?: Num;
      date?: { year?: number; month?: number; day?: number };
    };
  }>;
}

interface ActiveMinutesRollup {
  rollupDataPoints?: Array<{
    civilStartTime?: CivilDateTime;
    activeMinutes?: { activeMinutesSum?: Num };
  }>;
}

interface TotalCaloriesRollup {
  rollupDataPoints?: Array<{
    civilStartTime?: CivilDateTime;
    totalCalories?: { kcalSum?: Num };
  }>;
}

// ─── Coercion helpers ─────────────────────────────────────────────────────────

function toInt(v: Num): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" ? parseInt(v, 10) : Math.round(v);
  return isNaN(n) ? null : n;
}

function toFloat(v: Num): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? null : n;
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeSnapshot(
  date: string,
  sleep: FetchResult<SleepResponse>,
  steps: FetchResult<StepsRollup>,
  rhr: FetchResult<RhrResponse>,
  hrv: FetchResult<HrvResponse>,
  activeMinutes: FetchResult<ActiveMinutesRollup>,
  totalCalories: FetchResult<TotalCaloriesRollup>,
): DailySnapshot {
  const sleepPoint = sleep.data?.dataPoints?.[0]?.sleep;
  const sleepSummary = sleepPoint?.summary;
  const stages = sleepSummary?.stagesSummary ?? [];

  function stageMinutes(type: string): number | null {
    const s = stages.find(
      (st) => st.type?.toUpperCase() === type.toUpperCase(),
    );
    return toInt(s?.minutes);
  }

  const minutesAsleep = toInt(sleepSummary?.minutesAsleep);
  const minutesInPeriod = toInt(sleepSummary?.minutesInSleepPeriod);
  const sleepEfficiency =
    minutesAsleep !== null && minutesInPeriod !== null && minutesInPeriod > 0
      ? Math.round((minutesAsleep / minutesInPeriod) * 100)
      : null;

  const stepsPoint = steps.data?.rollupDataPoints?.[0]?.steps;
  const rhrPoint = rhr.data?.dataPoints?.[0]?.dailyRestingHeartRate;
  const hrvPoint = hrv.data?.dataPoints?.[0]?.dailyHeartRateVariability;
  const activePoint = activeMinutes.data?.rollupDataPoints?.[0]?.activeMinutes;
  const calPoint = totalCalories.data?.rollupDataPoints?.[0]?.totalCalories;

  // Only store calories if the day is substantially complete (> 500 kcal means
  // Fitbit has synced enough activity data — early-morning values like 3 kcal are useless).
  const rawKcal = toFloat(calPoint?.kcalSum);
  const totalCal = rawKcal !== null && rawKcal > 500 ? Math.round(rawKcal) : null;

  return {
    date,
    sleepMinutes: minutesAsleep,
    sleepEfficiency,
    sleepDeepMin: stageMinutes("DEEP"),
    sleepRemMin: stageMinutes("REM"),
    sleepLightMin: stageMinutes("LIGHT"),
    restingHr: toFloat(rhrPoint?.beatsPerMinute),
    hrv: toFloat(hrvPoint?.averageHeartRateVariabilityMilliseconds),
    steps: toInt(stepsPoint?.countSum),
    activeMinutes: toInt(activePoint?.activeMinutesSum),
    totalCalories: totalCal,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch and normalize one day of health data from the Google Health API.
 *
 * Priority under the shared rate limiter:
 *   1. Core readiness metrics (sleep, RHR, HRV) — needed for daily coaching
 *   2. Supporting activity metrics (steps, active minutes, calories)
 *
 * Also returns the first API error seen (if any) so callers can surface sync failures.
 */
export async function fetchDaySnapshot(
  userId: string,
  accessToken: string,
  date: string,
): Promise<{ snapshot: DailySnapshot; apiError: string | null }> {
  // Core first — these feed readiness; limiter slots go to them before activity.
  const [sleep, rhr, hrv] = await Promise.all([
    sleepList<SleepResponse>(userId, accessToken, date),
    dailyList<RhrResponse>(
      userId,
      accessToken,
      "daily-resting-heart-rate",
      "daily_resting_heart_rate",
      date,
    ),
    dailyList<HrvResponse>(
      userId,
      accessToken,
      "daily-heart-rate-variability",
      "daily_heart_rate_variability",
      date,
    ),
  ]);

  const [steps, activeMinutes, totalCalories] = await Promise.all([
    dailyRollUp<StepsRollup>(userId, accessToken, "steps", date),
    dailyRollUp<ActiveMinutesRollup>(userId, accessToken, "active-minutes", date),
    dailyRollUp<TotalCaloriesRollup>(userId, accessToken, "total-calories", date),
  ]);

  const apiError =
    (!sleep.ok ? sleep.error : null) ??
    (!rhr.ok ? rhr.error : null) ??
    (!hrv.ok ? hrv.error : null) ??
    (!steps.ok ? steps.error : null) ??
    (!activeMinutes.ok ? activeMinutes.error : null) ??
    (!totalCalories.ok ? totalCalories.error : null) ??
    null;

  return {
    snapshot: normalizeSnapshot(date, sleep, steps, rhr, hrv, activeMinutes, totalCalories),
    apiError,
  };
}

function pointDate(
  point: {
    date?: { year?: number; month?: number; day?: number };
    startTime?: CivilDateTime;
    dailyRestingHeartRate?: { date?: { year?: number; month?: number; day?: number } };
    dailyHeartRateVariability?: { date?: { year?: number; month?: number; day?: number } };
  },
): string | null {
  return (
    formatCivilDate(point.date) ??
    formatCivilDate(point.startTime?.date) ??
    formatCivilDate(point.dailyRestingHeartRate?.date) ??
    formatCivilDate(point.dailyHeartRateVariability?.date)
  );
}

async function fetchRollupByDate<TPoint extends { civilStartTime?: CivilDateTime }>(
  userId: string,
  accessToken: string,
  dataType: string,
  start: string,
  endInclusive: string,
  maxDays: number,
): Promise<{ byDate: Map<string, TPoint>; error: string | null }> {
  const byDate = new Map<string, TPoint>();
  let error: string | null = null;
  for (const chunk of chunkInclusiveRange(start, endInclusive, maxDays)) {
    const res = await dailyRollUpRange<{ rollupDataPoints?: TPoint[] }>(
      userId,
      accessToken,
      dataType,
      chunk.start,
      chunk.endInclusive,
    );
    if (!error && !res.ok) error = res.error ?? `${dataType} fetch failed`;
    for (const p of res.data?.rollupDataPoints ?? []) {
      const d = formatCivilDate(p.civilStartTime?.date);
      if (d) byDate.set(d, p);
    }
  }
  return { byDate, error };
}

/**
 * Batch-fetch a contiguous range with ~6 metric calls (chunked for 14-day limits)
 * instead of 6 × N per-day calls.
 */
async function fetchSnapshotsRangeBatched(
  userId: string,
  accessToken: string,
  dates: string[],
): Promise<{ snapshots: DailySnapshot[]; apiError: string | null }> {
  const sorted = [...dates].sort();
  const start = sorted[0]!;
  const endInclusive = sorted[sorted.length - 1]!;
  const want = new Set(dates);
  const {
    constrainedRollupMaxDays,
    defaultRangeMaxDays,
  } = GOOGLE_HEALTH_SYNC;

  // Core first — fewer calls, still prioritized before activity rollups.
  const [sleepRes, rhrRes, hrvRes] = await Promise.all([
    (async () => {
      const byDate = new Map<string, NonNullable<SleepResponse["dataPoints"]>[number]>();
      let error: string | null = null;
      for (const chunk of chunkInclusiveRange(start, endInclusive, defaultRangeMaxDays)) {
        const res = await sleepListRange<SleepResponse>(
          userId,
          accessToken,
          chunk.start,
          chunk.endInclusive,
        );
        if (!error && !res.ok) error = res.error ?? "Sleep fetch failed";
        for (const dp of res.data?.dataPoints ?? []) {
          const end = dp.sleep?.interval?.civilEndTime;
          const d = end?.slice(0, 10);
          if (!d || !want.has(d)) continue;
          const prev = byDate.get(d);
          const prevMin = toInt(prev?.sleep?.summary?.minutesAsleep) ?? 0;
          const nextMin = toInt(dp.sleep?.summary?.minutesAsleep) ?? 0;
          if (!prev || nextMin >= prevMin) byDate.set(d, dp);
        }
      }
      return { byDate, error };
    })(),
    (async () => {
      const byDate = new Map<string, NonNullable<RhrResponse["dataPoints"]>[number]>();
      let error: string | null = null;
      for (const chunk of chunkInclusiveRange(start, endInclusive, defaultRangeMaxDays)) {
        const res = await dailyListRange<RhrResponse>(
          userId,
          accessToken,
          "daily-resting-heart-rate",
          "daily_resting_heart_rate",
          chunk.start,
          chunk.endInclusive,
        );
        if (!error && !res.ok) error = res.error ?? "RHR fetch failed";
        for (const dp of res.data?.dataPoints ?? []) {
          const d = pointDate(dp);
          if (d && want.has(d)) byDate.set(d, dp);
        }
      }
      return { byDate, error };
    })(),
    (async () => {
      const byDate = new Map<string, NonNullable<HrvResponse["dataPoints"]>[number]>();
      let error: string | null = null;
      for (const chunk of chunkInclusiveRange(start, endInclusive, defaultRangeMaxDays)) {
        const res = await dailyListRange<HrvResponse>(
          userId,
          accessToken,
          "daily-heart-rate-variability",
          "daily_heart_rate_variability",
          chunk.start,
          chunk.endInclusive,
        );
        if (!error && !res.ok) error = res.error ?? "HRV fetch failed";
        for (const dp of res.data?.dataPoints ?? []) {
          const d = pointDate(dp);
          if (d && want.has(d)) byDate.set(d, dp);
        }
      }
      return { byDate, error };
    })(),
  ]);

  const [stepsRes, activeRes, calRes] = await Promise.all([
    fetchRollupByDate<NonNullable<StepsRollup["rollupDataPoints"]>[number]>(
      userId,
      accessToken,
      "steps",
      start,
      endInclusive,
      defaultRangeMaxDays,
    ),
    fetchRollupByDate<NonNullable<ActiveMinutesRollup["rollupDataPoints"]>[number]>(
      userId,
      accessToken,
      "active-minutes",
      start,
      endInclusive,
      constrainedRollupMaxDays,
    ),
    fetchRollupByDate<NonNullable<TotalCaloriesRollup["rollupDataPoints"]>[number]>(
      userId,
      accessToken,
      "total-calories",
      start,
      endInclusive,
      constrainedRollupMaxDays,
    ),
  ]);

  const apiError =
    sleepRes.error ??
    rhrRes.error ??
    hrvRes.error ??
    stepsRes.error ??
    activeRes.error ??
    calRes.error ??
    null;

  const snapshots = dates.map((date) => {
    const sleepDp = sleepRes.byDate.get(date);
    const rhrDp = rhrRes.byDate.get(date);
    const hrvDp = hrvRes.byDate.get(date);
    const stepsPt = stepsRes.byDate.get(date);
    const activePt = activeRes.byDate.get(date);
    const calPt = calRes.byDate.get(date);

    return normalizeSnapshot(
      date,
      okResult<SleepResponse>({ dataPoints: sleepDp ? [sleepDp] : [] }),
      okResult<StepsRollup>({ rollupDataPoints: stepsPt ? [stepsPt] : [] }),
      okResult<RhrResponse>({ dataPoints: rhrDp ? [rhrDp] : [] }),
      okResult<HrvResponse>({ dataPoints: hrvDp ? [hrvDp] : [] }),
      okResult<ActiveMinutesRollup>({
        rollupDataPoints: activePt ? [activePt] : [],
      }),
      okResult<TotalCaloriesRollup>({
        rollupDataPoints: calPt ? [calPt] : [],
      }),
    );
  });

  return { snapshots, apiError };
}

/**
 * Fetch specific dates from Google Health.
 * Today (if included) is fetched first for readiness; remaining days use a
 * batched range read (~6 calls / window instead of 6 × N).
 */
export async function fetchSnapshotsForDates(
  userId: string,
  accessToken: string,
  dates: string[],
  today: string,
): Promise<{ snapshots: DailySnapshot[]; apiError: string | null }> {
  if (dates.length === 0) {
    return { snapshots: [], apiError: null };
  }

  const byDate = new Map<string, DailySnapshot>();
  let apiError: string | null = null;

  // Daily-critical: today alone first when requested.
  if (dates.includes(today)) {
    const todayResult = await fetchDaySnapshot(userId, accessToken, today);
    byDate.set(today, todayResult.snapshot);
    apiError = todayResult.apiError;
  }

  const rest = dates.filter((d) => d !== today);
  if (rest.length === 1) {
    const one = await fetchDaySnapshot(userId, accessToken, rest[0]!);
    byDate.set(rest[0]!, one.snapshot);
    if (!apiError && one.apiError) apiError = one.apiError;
  } else if (rest.length > 1) {
    const batched = await fetchSnapshotsRangeBatched(userId, accessToken, rest);
    for (let i = 0; i < rest.length; i++) {
      byDate.set(rest[i]!, batched.snapshots[i]!);
    }
    if (!apiError && batched.apiError) apiError = batched.apiError;
  }

  return {
    snapshots: dates.map((d) => byDate.get(d)!),
    apiError,
  };
}

/**
 * Fetch and normalize the last N days (including today).
 * Today is fetched first so daily-critical data lands under the rate budget;
 * prior days follow newest → oldest. Returns oldest → newest, plus first API error.
 */
export async function fetchRecentSnapshots(
  userId: string,
  accessToken: string,
  today: string,
  days = 7,
): Promise<{ snapshots: DailySnapshot[]; apiError: string | null }> {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(subtractDays(today, i));
  }
  return fetchSnapshotsForDates(userId, accessToken, dates, today);
}

/** Returns today's local date as YYYY-MM-DD (server timezone — use client date when possible). */
export function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Exercise / workouts ──────────────────────────────────────────────────────

/**
 * Exercise type strings returned by Google Health API.
 * Map to a simpler label for display.
 */
const EXERCISE_TYPE_LABELS: Record<string, string> = {
  RUNNING: "Running",
  WALKING: "Walking",
  BIKING: "Cycling",
  SWIMMING: "Swimming",
  HIKING: "Hiking",
  YOGA: "Yoga",
  PILATES: "Pilates",
  WORKOUT: "Workout",
  HIIT: "HIIT",
  WEIGHTLIFTING: "Weightlifting",
  STRENGTH_TRAINING: "Strength training",
  OTHER: "Exercise",
};

export interface WorkoutSession {
  /** ISO timestamp of workout start */
  startTime: string;
  /** ISO timestamp of workout end */
  endTime: string;
  /** YYYY-MM-DD local date the workout started */
  date: string;
  /** Human-readable type label */
  typeLabel: string;
  /** Raw API exercise type string */
  typeRaw: string;
  /** Active duration in minutes */
  durationMinutes: number;
  /** Source platform (e.g. "FITBIT") */
  source: string | null;
}

interface ExerciseInterval {
  civilStartTime?: string; // ISO datetime
  civilEndTime?: string;
}

interface ExerciseDataPoint {
  exercise?: {
    interval?: ExerciseInterval;
    exerciseType?: string;
    displayName?: string;
    activeDuration?: { seconds?: Num };
    exerciseMetadata?: { platform?: string };
  };
}

interface ExerciseResponse {
  dataPoints?: ExerciseDataPoint[];
}

/**
 * Fetch recorded exercise sessions within a date range.
 * Uses `exercise.interval.civil_start_time` for filtering.
 * Returns up to 25 sessions (Google Health API page limit for exercise).
 */
export async function fetchRecentWorkouts(
  userId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<WorkoutSession[]> {
  const filter = `exercise.interval.civil_start_time >= "${startDate}" AND exercise.interval.civil_start_time < "${addDays(endDate, 1)}"`;
  const params = new URLSearchParams({ filter });
  const result = await googleHealthFetch<ExerciseResponse>(
    userId,
    `${HEALTH_API_BASE}/users/me/dataTypes/exercise/dataPoints?${params.toString()}`,
    accessToken,
  );

  if (!result.ok || !result.data?.dataPoints) return [];

  const workouts: WorkoutSession[] = [];

  for (const dp of result.data.dataPoints) {
    const ex = dp.exercise;
    if (!ex) continue;

    const start = ex.interval?.civilStartTime;
    const end = ex.interval?.civilEndTime;
    if (!start) continue;

    // Duration from activeDuration seconds, fallback to interval diff
    let durationMinutes = 0;
    const activeSecs = toFloat(ex.activeDuration?.seconds);
    if (activeSecs !== null && activeSecs > 0) {
      durationMinutes = Math.round(activeSecs / 60);
    } else if (start && end) {
      const ms = new Date(end).getTime() - new Date(start).getTime();
      durationMinutes = Math.round(ms / 60000);
    }

    if (durationMinutes < 5) continue; // skip trivially short auto-detects

    const typeRaw = ex.exerciseType ?? "OTHER";
    const typeLabel =
      ex.displayName?.trim() ||
      EXERCISE_TYPE_LABELS[typeRaw] ||
      "Exercise";

    workouts.push({
      startTime: start,
      endTime: end ?? start,
      date: start.slice(0, 10),
      typeLabel,
      typeRaw,
      durationMinutes,
      source: ex.exerciseMetadata?.platform ?? null,
    });
  }

  // Newest first
  workouts.sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  );
  return workouts;
}
