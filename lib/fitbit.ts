import type {
  FitbitActivityResponse,
  FitbitBreathingRateResponse,
  FitbitDashboardData,
  FitbitEndpointResult,
  FitbitHeartResponse,
  FitbitHRVResponse,
  FitbitProfileResponse,
  FitbitSkinTempResponse,
  FitbitSleepResponse,
  FitbitSpO2Response,
} from "@/types/fitbit";

const FITBIT_API_BASE = "https://api.fitbit.com";

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchFitbitEndpoint<T>(
  path: string,
  accessToken: string,
): Promise<FitbitEndpointResult<T>> {
  try {
    const response = await fetch(`${FITBIT_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorBody = (await response.json()) as {
          errors?: Array<{ message: string }>;
        };
        errorMessage =
          errorBody.errors?.[0]?.message ?? errorMessage;
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

export async function getAllFitbitData(
  accessToken: string,
  date: string = getTodayDate(),
): Promise<FitbitDashboardData> {
  const [
    profile,
    sleep,
    heart,
    activity,
    spo2,
    breathingRate,
    hrv,
    skinTemperature,
  ] = await Promise.all([
    fetchFitbitEndpoint<FitbitProfileResponse>(
      "/1/user/-/profile.json",
      accessToken,
    ),
    fetchFitbitEndpoint<FitbitSleepResponse>(
      `/1.2/user/-/sleep/date/${date}.json`,
      accessToken,
    ),
    fetchFitbitEndpoint<FitbitHeartResponse>(
      `/1/user/-/activities/heart/date/${date}/1d.json`,
      accessToken,
    ),
    fetchFitbitEndpoint<FitbitActivityResponse>(
      `/1/user/-/activities/date/${date}.json`,
      accessToken,
    ),
    fetchFitbitEndpoint<FitbitSpO2Response>(
      `/1/user/-/spo2/date/${date}.json`,
      accessToken,
    ),
    fetchFitbitEndpoint<FitbitBreathingRateResponse>(
      `/1/user/-/br/date/${date}.json`,
      accessToken,
    ),
    fetchFitbitEndpoint<FitbitHRVResponse>(
      `/1/user/-/hrv/date/${date}.json`,
      accessToken,
    ),
    fetchFitbitEndpoint<FitbitSkinTempResponse>(
      `/1/user/-/temp/skin/date/${date}.json`,
      accessToken,
    ),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    date,
    profile,
    sleep,
    heart,
    activity,
    spo2,
    breathingRate,
    hrv,
    skinTemperature,
  };
}

export function formatMinutesAsHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
