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

// ─── Low-level fetch ──────────────────────────────────────────────────────────

interface FetchResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function apiFetch<T = unknown>(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        msg = body.error?.message ?? msg;
      } catch {
        // keep default
      }
      return { ok: false, error: msg };
    }

    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Fetch error",
    };
  }
}

// ─── Endpoint helpers ─────────────────────────────────────────────────────────

async function dailyRollUp<T = unknown>(
  accessToken: string,
  dataType: string,
  date: string,
): Promise<FetchResult<T>> {
  const nextDate = addDays(date, 1);
  return apiFetch<T>(
    `${HEALTH_API_BASE}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        range: {
          start: { date: parseCivilDate(date) },
          end: { date: parseCivilDate(nextDate) },
        },
        windowSizeDays: 1,
      }),
    },
  );
}

async function dailyList<T = unknown>(
  accessToken: string,
  dataType: string,
  filterField: string,
  date: string,
): Promise<FetchResult<T>> {
  const nextDate = addDays(date, 1);
  const filter = `${filterField}.date >= "${date}" AND ${filterField}.date < "${nextDate}"`;
  const params = new URLSearchParams({ filter });
  return apiFetch<T>(
    `${HEALTH_API_BASE}/users/me/dataTypes/${dataType}/dataPoints?${params.toString()}`,
    accessToken,
  );
}

async function sleepList<T = unknown>(
  accessToken: string,
  date: string,
): Promise<FetchResult<T>> {
  const nextDate = addDays(date, 1);
  const filter = `sleep.interval.civil_end_time >= "${date}" AND sleep.interval.civil_end_time < "${nextDate}"`;
  const params = new URLSearchParams({ filter });
  return apiFetch<T>(
    `${HEALTH_API_BASE}/users/me/dataTypes/sleep/dataPoints?${params.toString()}`,
    accessToken,
  );
}

// ─── Raw API response shapes (minimal) ───────────────────────────────────────
// Google Health API returns numeric fields as strings over the wire despite
// the JSON spec. Use `number | string` and coerce during normalization.

type Num = number | string | undefined;

interface StepsRollup {
  rollupDataPoints?: Array<{ steps?: { countSum?: Num } }>;
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
      summary?: SleepSummaryFields;
    };
  }>;
}

interface RhrResponse {
  dataPoints?: Array<{
    dailyRestingHeartRate?: { beatsPerMinute?: Num };
  }>;
}

interface HrvResponse {
  dataPoints?: Array<{
    dailyHeartRateVariability?: {
      averageHeartRateVariabilityMilliseconds?: Num;
    };
  }>;
}

interface ActiveMinutesRollup {
  rollupDataPoints?: Array<{
    activeMinutes?: { activeMinutesSum?: Num };
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
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch and normalize one day of health data from the Google Health API.
 */
export async function fetchDaySnapshot(
  accessToken: string,
  date: string,
): Promise<DailySnapshot> {
  const [sleep, steps, rhr, hrv, activeMinutes] = await Promise.all([
    sleepList<SleepResponse>(accessToken, date),
    dailyRollUp<StepsRollup>(accessToken, "steps", date),
    dailyList<RhrResponse>(
      accessToken,
      "daily-resting-heart-rate",
      "daily_resting_heart_rate",
      date,
    ),
    dailyList<HrvResponse>(
      accessToken,
      "daily-heart-rate-variability",
      "daily_heart_rate_variability",
      date,
    ),
    dailyRollUp<ActiveMinutesRollup>(accessToken, "active-minutes", date),
  ]);

  return normalizeSnapshot(date, sleep, steps, rhr, hrv, activeMinutes);
}

/**
 * Fetch and normalize the last N days (including today).
 * Returns an array ordered oldest → newest.
 */
export async function fetchRecentSnapshots(
  accessToken: string,
  today: string,
  days = 7,
): Promise<DailySnapshot[]> {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(subtractDays(today, i));
  }

  const snapshots = await Promise.all(
    dates.map((d) => fetchDaySnapshot(accessToken, d)),
  );
  return snapshots;
}

/** Returns today's local date as YYYY-MM-DD (server timezone — use client date when possible). */
export function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
