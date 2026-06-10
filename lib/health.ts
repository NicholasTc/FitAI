import type { HealthDashboardData, HealthEndpointResult } from "@/types/health";

const HEALTH_API_BASE = "https://health.googleapis.com/v4";

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getNextDate(date: string): string {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString().slice(0, 10);
}

async function fetchHealthEndpoint<T = unknown>(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<HealthEndpointResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorBody = (await response.json()) as {
          error?: { message?: string };
        };
        errorMessage = errorBody.error?.message ?? errorMessage;
      } catch {
        // Keep default HTTP status message.
      }

      return {
        ok: false,
        status: response.status,
        error: errorMessage,
      };
    }

    const data = (await response.json()) as T;

    return {
      ok: true,
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Unknown fetch error",
    };
  }
}

function parseCivilDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

async function fetchDailyRollUp(
  accessToken: string,
  dataType: string,
  date: string,
): Promise<HealthEndpointResult> {
  const nextDate = getNextDate(date);

  return fetchHealthEndpoint(
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

// Daily summary types use snake_case filter field names per Google Health API docs.
async function fetchDailyList(
  accessToken: string,
  dataType: string,
  filterField: string,
  date: string,
): Promise<HealthEndpointResult> {
  const nextDate = getNextDate(date);
  const filter = `${filterField}.date >= "${date}" AND ${filterField}.date < "${nextDate}"`;
  const params = new URLSearchParams({ filter });

  return fetchHealthEndpoint(
    `${HEALTH_API_BASE}/users/me/dataTypes/${dataType}/dataPoints?${params.toString()}`,
    accessToken,
  );
}

async function fetchSleepList(
  accessToken: string,
  date: string,
): Promise<HealthEndpointResult> {
  const nextDate = getNextDate(date);
  const filter = `sleep.interval.civil_end_time >= "${date}" AND sleep.interval.civil_end_time < "${nextDate}"`;
  const params = new URLSearchParams({ filter });

  return fetchHealthEndpoint(
    `${HEALTH_API_BASE}/users/me/dataTypes/sleep/dataPoints?${params.toString()}`,
    accessToken,
  );
}

export async function getAllHealthData(
  accessToken: string,
  date: string = getTodayDate(),
): Promise<HealthDashboardData> {
  const [
    profile,
    steps,
    sleep,
    restingHeartRate,
    heartRate,
    heartRateVariability,
    oxygenSaturation,
    respiratoryRate,
    activeMinutes,
    totalCalories,
    distance,
    sleepTemperature,
  ] = await Promise.all([
    fetchHealthEndpoint(
      `${HEALTH_API_BASE}/users/me/profile`,
      accessToken,
    ),
    fetchDailyRollUp(accessToken, "steps", date),
    fetchSleepList(accessToken, date),
    fetchDailyList(
      accessToken,
      "daily-resting-heart-rate",
      "daily_resting_heart_rate",
      date,
    ),
    fetchDailyRollUp(accessToken, "heart-rate", date),
    fetchDailyList(
      accessToken,
      "daily-heart-rate-variability",
      "daily_heart_rate_variability",
      date,
    ),
    fetchDailyList(
      accessToken,
      "daily-oxygen-saturation",
      "daily_oxygen_saturation",
      date,
    ),
    fetchDailyList(
      accessToken,
      "daily-respiratory-rate",
      "daily_respiratory_rate",
      date,
    ),
    fetchDailyRollUp(accessToken, "active-minutes", date),
    fetchDailyRollUp(accessToken, "total-calories", date),
    fetchDailyRollUp(accessToken, "distance", date),
    fetchDailyList(
      accessToken,
      "daily-sleep-temperature-derivations",
      "daily_sleep_temperature_derivations",
      date,
    ),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    date,
    profile,
    steps,
    sleep,
    restingHeartRate,
    heartRate,
    heartRateVariability,
    oxygenSaturation,
    respiratoryRate,
    activeMinutes,
    totalCalories,
    distance,
    sleepTemperature,
  };
}

export function formatMinutesAsHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
