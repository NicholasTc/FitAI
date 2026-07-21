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

/**
 * Fitbit-style Fat Burn / Cardio / Peak minutes come from `active-zone-minutes`,
 * NOT `time-in-heart-rate-zone` (that type uses LIGHT/MODERATE/VIGOROUS/PEAK).
 */
interface ActiveZoneMinutesRollup {
  rollupDataPoints?: Array<{
    civilStartTime?: CivilDateTime;
    activeZoneMinutes?: {
      sumInFatBurnHeartZone?: Num;
      sumInCardioHeartZone?: Num;
      sumInPeakHeartZone?: Num;
    };
  }>;
}

export interface ZoneMinutes {
  fatBurnMin: number | null;
  cardioMin: number | null;
  peakMin: number | null;
}

/**
 * Karvonen (heart-rate-reserve) cardio zones — see docs/cardio-zones-plan.md.
 * `daily-heart-rate-zones` gives personalized bpm boundaries (Daily record,
 * `list` only — no rollup); `time-in-heart-rate-zone` gives actual minutes
 * spent per zone (Interval record, supports `dailyRollUp`). Both use the same
 * LIGHT/MODERATE/VIGOROUS/PEAK taxonomy, distinct from active-zone-minutes'
 * Fitbit-branded FAT_BURN/CARDIO/PEAK.
 */
interface DailyHeartRateZonesResponse {
  dataPoints?: Array<{
    date?: { year?: number; month?: number; day?: number };
    dailyHeartRateZones?: {
      heartRateZones?: Array<{
        heartRateZoneType?: string; // "LIGHT" | "MODERATE" | "VIGOROUS" | "PEAK"
        minBeatsPerMinute?: Num;
        maxBeatsPerMinute?: Num;
      }>;
    };
  }>;
}

interface TimeInHeartRateZoneRollup {
  rollupDataPoints?: Array<{
    civilStartTime?: CivilDateTime;
    timeInHeartRateZone?: {
      timeInHeartRateZones?: Array<{
        heartRateZone?: string; // "LIGHT" | "MODERATE" | "VIGOROUS" | "PEAK"
        duration?: string; // google-duration, e.g. "930.5s"
      }>;
    };
  }>;
}

export interface CardioZoneBpm {
  minBpm: number | null;
  maxBpm: number | null;
}

export interface CardioZones {
  lightMin: number | null;
  moderateMin: number | null;
  vigorousMin: number | null;
  peakMin: number | null;
  light: CardioZoneBpm;
  moderate: CardioZoneBpm;
  vigorous: CardioZoneBpm;
  peak: CardioZoneBpm;
}

function emptyCardioZones(): CardioZones {
  return {
    lightMin: null,
    moderateMin: null,
    vigorousMin: null,
    peakMin: null,
    light: { minBpm: null, maxBpm: null },
    moderate: { minBpm: null, maxBpm: null },
    vigorous: { minBpm: null, maxBpm: null },
    peak: { minBpm: null, maxBpm: null },
  };
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

/** Parses a Google "google-duration" string, e.g. "930.5s", into seconds. */
function parseGoogleDurationSeconds(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/s$/, ""));
  return isNaN(n) ? null : n;
}

function parseHeartRateZoneBounds(
  point: NonNullable<DailyHeartRateZonesResponse["dataPoints"]>[number] | undefined,
): Pick<CardioZones, "light" | "moderate" | "vigorous" | "peak"> {
  const zones = point?.dailyHeartRateZones?.heartRateZones ?? [];
  const find = (type: string) => zones.find((z) => z.heartRateZoneType === type);
  const toBpm = (z: (typeof zones)[number] | undefined): CardioZoneBpm => ({
    minBpm: toInt(z?.minBeatsPerMinute),
    maxBpm: toInt(z?.maxBeatsPerMinute),
  });
  return {
    light: toBpm(find("LIGHT")),
    moderate: toBpm(find("MODERATE")),
    vigorous: toBpm(find("VIGOROUS")),
    peak: toBpm(find("PEAK")),
  };
}

function parseTimeInHeartRateZoneMinutes(
  point: NonNullable<TimeInHeartRateZoneRollup["rollupDataPoints"]>[number] | undefined,
): Pick<CardioZones, "lightMin" | "moderateMin" | "vigorousMin" | "peakMin"> {
  const entries = point?.timeInHeartRateZone?.timeInHeartRateZones ?? [];
  const minutesFor = (type: string): number | null => {
    const e = entries.find((x) => x.heartRateZone === type);
    if (!e) return null;
    const secs = parseGoogleDurationSeconds(e.duration);
    return secs !== null ? Math.round(secs / 60) : 0;
  };
  return {
    lightMin: minutesFor("LIGHT"),
    moderateMin: minutesFor("MODERATE"),
    vigorousMin: minutesFor("VIGOROUS"),
    peakMin: minutesFor("PEAK"),
  };
}

/**
 * Combines the two zone fetches into one CardioZones record.
 * Null when the API call itself failed; 0 (not null) minutes when the call
 * succeeded but returned no entry for a zone — same "present but zero is
 * real data" rule as parseZoneMinutesFromRollup.
 */
function parseCardioZones(
  bounds: FetchResult<DailyHeartRateZonesResponse> | Pick<CardioZones, "light" | "moderate" | "vigorous" | "peak"> | null,
  minutes: FetchResult<TimeInHeartRateZoneRollup> | Pick<CardioZones, "lightMin" | "moderateMin" | "vigorousMin" | "peakMin"> | null,
): CardioZones {
  const empty = emptyCardioZones();

  const boundsPart =
    bounds && "ok" in bounds
      ? bounds.ok
        ? parseHeartRateZoneBounds(bounds.data?.dataPoints?.[0])
        : { light: empty.light, moderate: empty.moderate, vigorous: empty.vigorous, peak: empty.peak }
      : (bounds ?? { light: empty.light, moderate: empty.moderate, vigorous: empty.vigorous, peak: empty.peak });

  const minutesPart =
    minutes && "ok" in minutes
      ? minutes.ok
        ? parseTimeInHeartRateZoneMinutes(minutes.data?.rollupDataPoints?.[0])
        : { lightMin: null, moderateMin: null, vigorousMin: null, peakMin: null }
      : (minutes ?? { lightMin: null, moderateMin: null, vigorousMin: null, peakMin: null });

  return { ...boundsPart, ...minutesPart };
}

function parseZoneMinutesFromRollup(
  point: NonNullable<ActiveZoneMinutesRollup["rollupDataPoints"]>[number] | undefined,
): ZoneMinutes {
  const empty: ZoneMinutes = { fatBurnMin: null, cardioMin: null, peakMin: null };
  if (!point?.activeZoneMinutes) return empty;
  const azm = point.activeZoneMinutes;
  // Fields are already in minutes (int64 as string). Present-but-zero is valid data.
  const hasAny =
    azm.sumInFatBurnHeartZone !== undefined ||
    azm.sumInCardioHeartZone !== undefined ||
    azm.sumInPeakHeartZone !== undefined;
  if (!hasAny) return empty;
  return {
    fatBurnMin: toInt(azm.sumInFatBurnHeartZone) ?? 0,
    cardioMin: toInt(azm.sumInCardioHeartZone) ?? 0,
    peakMin: toInt(azm.sumInPeakHeartZone) ?? 0,
  };
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
  zones: FetchResult<ActiveZoneMinutesRollup> | ZoneMinutes | null,
  zoneBounds: FetchResult<DailyHeartRateZonesResponse> | Pick<CardioZones, "light" | "moderate" | "vigorous" | "peak"> | null,
  zoneTime: FetchResult<TimeInHeartRateZoneRollup> | Pick<CardioZones, "lightMin" | "moderateMin" | "vigorousMin" | "peakMin"> | null,
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

  let zoneMins: ZoneMinutes = { fatBurnMin: null, cardioMin: null, peakMin: null };
  if (zones && "ok" in zones) {
    if (zones.ok) {
      zoneMins = parseZoneMinutesFromRollup(zones.data?.rollupDataPoints?.[0]);
      // Successful API response with no AZM for the day → store 0 so we don't
      // keep treating the day as "never ingested". Real minutes overwrite on later syncs.
      if (
        zoneMins.fatBurnMin === null &&
        zoneMins.cardioMin === null &&
        zoneMins.peakMin === null
      ) {
        zoneMins = { fatBurnMin: 0, cardioMin: 0, peakMin: 0 };
      }
    }
  } else if (zones) {
    zoneMins = zones;
  }

  const cardioZones = parseCardioZones(zoneBounds, zoneTime);

  return {
    date,
    sleepMinutes: minutesAsleep,
    sleepEfficiency,
    sleepDeepMin: stageMinutes("DEEP"),
    sleepRemMin: stageMinutes("REM"),
    sleepLightMin: stageMinutes("LIGHT"),
    sleepAwakeMin: toInt(sleepSummary?.minutesAwake),
    restingHr: toFloat(rhrPoint?.beatsPerMinute),
    hrv: toFloat(hrvPoint?.averageHeartRateVariabilityMilliseconds),
    steps: toInt(stepsPoint?.countSum),
    activeMinutes: toInt(activePoint?.activeMinutesSum),
    totalCalories: totalCal,
    fatBurnMin: zoneMins.fatBurnMin,
    cardioMin: zoneMins.cardioMin,
    peakMin: zoneMins.peakMin,
    zoneLightMin: cardioZones.lightMin,
    zoneModerateMin: cardioZones.moderateMin,
    zoneVigorousMin: cardioZones.vigorousMin,
    zonePeakMin: cardioZones.peakMin,
    zoneLightMinBpm: cardioZones.light.minBpm,
    zoneLightMaxBpm: cardioZones.light.maxBpm,
    zoneModerateMinBpm: cardioZones.moderate.minBpm,
    zoneModerateMaxBpm: cardioZones.moderate.maxBpm,
    zoneVigorousMinBpm: cardioZones.vigorous.minBpm,
    zoneVigorousMaxBpm: cardioZones.vigorous.maxBpm,
    zonePeakMinBpm: cardioZones.peak.minBpm,
    zonePeakMaxBpm: cardioZones.peak.maxBpm,
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

  const [steps, activeMinutes, totalCalories, zones, zoneBounds, zoneTime] = await Promise.all([
    dailyRollUp<StepsRollup>(userId, accessToken, "steps", date),
    dailyRollUp<ActiveMinutesRollup>(userId, accessToken, "active-minutes", date),
    dailyRollUp<TotalCaloriesRollup>(userId, accessToken, "total-calories", date),
    dailyRollUp<ActiveZoneMinutesRollup>(
      userId,
      accessToken,
      "active-zone-minutes",
      date,
    ),
    // Daily record type — list only, no rollup (see docs/cardio-zones-plan.md).
    dailyList<DailyHeartRateZonesResponse>(
      userId,
      accessToken,
      "daily-heart-rate-zones",
      "daily_heart_rate_zones",
      date,
    ),
    dailyRollUp<TimeInHeartRateZoneRollup>(
      userId,
      accessToken,
      "time-in-heart-rate-zone",
      date,
    ),
  ]);

  const apiError =
    (!sleep.ok ? sleep.error : null) ??
    (!rhr.ok ? rhr.error : null) ??
    (!hrv.ok ? hrv.error : null) ??
    (!steps.ok ? steps.error : null) ??
    (!activeMinutes.ok ? activeMinutes.error : null) ??
    (!totalCalories.ok ? totalCalories.error : null) ??
    (!zones.ok ? zones.error : null) ??
    // Cardio-zone fetch failures are non-fatal — never block the whole sync
    // (or surface a misleading top-level error) over a supplementary metric.
    null;

  return {
    snapshot: normalizeSnapshot(
      date,
      sleep,
      steps,
      rhr,
      hrv,
      activeMinutes,
      totalCalories,
      zones,
      zoneBounds,
      zoneTime,
    ),
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

  const [stepsRes, activeRes, calRes, zonesRes, zoneBoundsRes, zoneTimeRes] = await Promise.all([
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
    fetchRollupByDate<NonNullable<ActiveZoneMinutesRollup["rollupDataPoints"]>[number]>(
      userId,
      accessToken,
      "active-zone-minutes",
      start,
      endInclusive,
      defaultRangeMaxDays,
    ),
    // Daily record type — list only, no rollup (see docs/cardio-zones-plan.md).
    (async () => {
      const byDate = new Map<string, NonNullable<DailyHeartRateZonesResponse["dataPoints"]>[number]>();
      let error: string | null = null;
      for (const chunk of chunkInclusiveRange(start, endInclusive, defaultRangeMaxDays)) {
        const res = await dailyListRange<DailyHeartRateZonesResponse>(
          userId,
          accessToken,
          "daily-heart-rate-zones",
          "daily_heart_rate_zones",
          chunk.start,
          chunk.endInclusive,
        );
        if (!error && !res.ok) error = res.error ?? "Cardio zone bounds fetch failed";
        for (const dp of res.data?.dataPoints ?? []) {
          const d = formatCivilDate(dp.date);
          if (d && want.has(d)) byDate.set(d, dp);
        }
      }
      return { byDate, error };
    })(),
    fetchRollupByDate<NonNullable<TimeInHeartRateZoneRollup["rollupDataPoints"]>[number]>(
      userId,
      accessToken,
      "time-in-heart-rate-zone",
      start,
      endInclusive,
      defaultRangeMaxDays,
    ),
  ]);

  const apiError =
    sleepRes.error ??
    rhrRes.error ??
    hrvRes.error ??
    stepsRes.error ??
    activeRes.error ??
    calRes.error ??
    zonesRes.error ??
    // Cardio-zone fetch failures (zoneBoundsRes/zoneTimeRes) are non-fatal —
    // same policy as fetchDaySnapshot, never block the whole sync over a
    // supplementary metric.
    null;

  const snapshots = dates.map((date) => {
    const sleepDp = sleepRes.byDate.get(date);
    const rhrDp = rhrRes.byDate.get(date);
    const hrvDp = hrvRes.byDate.get(date);
    const stepsPt = stepsRes.byDate.get(date);
    const activePt = activeRes.byDate.get(date);
    const calPt = calRes.byDate.get(date);
    const zonePt = zonesRes.byDate.get(date);
    const zoneBoundsPt = zoneBoundsRes.byDate.get(date);
    const zoneTimePt = zoneTimeRes.byDate.get(date);

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
      parseZoneMinutesFromRollup(zonePt),
      parseHeartRateZoneBounds(zoneBoundsPt),
      parseTimeInHeartRateZoneMinutes(zoneTimePt),
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
