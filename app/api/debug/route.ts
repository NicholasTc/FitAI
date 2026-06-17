/**
 * Debug endpoint — exposes session state, token expiry, raw API responses,
 * and stored DB snapshots. Only use during development.
 */
import { auth } from "@/lib/auth";
import { computeBaseline } from "@/lib/baseline";
import { fetchDaySnapshot, fetchRecentWorkouts } from "@/lib/health";
import { loadSnapshots } from "@/lib/sync";
import { db } from "@/lib/db";

const HEALTH_API_BASE = "https://health.googleapis.com/v4";

function parseCivilDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

async function fetchCaloriesRollup(accessToken: string, date: string) {
  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + 1);
  const endDateStr = nextDate.toISOString().slice(0, 10);

  const body = {
    range: {
      start: { date: parseCivilDate(date) },
      end: { date: parseCivilDate(endDateStr) },
    },
    windowSizeDays: 1,
  };

  const res = await fetch(
    `${HEALTH_API_BASE}/users/me/dataTypes/total-calories/dataPoints:dailyRollUp`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  const json = await res.json();

  return {
    status: res.status,
    ok: res.ok,
    raw: json,
    parsed:
      (json as { rollupDataPoints?: Array<{ totalCalories?: { kcalSum?: number } }> })
        ?.rollupDataPoints?.[0]?.totalCalories?.kcalSum ?? null,
  };
}

export async function GET() {
  const session = await auth();

  if (!session?.accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = (session as { expiresAt?: number }).expiresAt;
  const tokenAge = expiresAt ? expiresAt - now : null;

  const localDate = new Date().toLocaleDateString("en-CA");
  const userId = session.user?.id;

  // Fetch today's snapshot raw from the API (bypasses DB).
  let rawSnapshot = null;
  let rawError = null;
  try {
    rawSnapshot = await fetchDaySnapshot(session.accessToken, localDate);
  } catch (e) {
    rawError = e instanceof Error ? e.message : String(e);
  }

  // Fetch raw exercise data from the API for the last 7 days.
  const sevenDaysAgo = new Date(localDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const windowStart = sevenDaysAgo.toISOString().slice(0, 10);

  let rawWorkouts = null;
  let rawWorkoutsError = null;
  try {
    rawWorkouts = await fetchRecentWorkouts(session.accessToken, windowStart, localDate);
  } catch (e) {
    rawWorkoutsError = e instanceof Error ? e.message : String(e);
  }

  // Probe: total-calories + active-energy-burned for today.
  let rawCalories = null;
  let rawCaloriesError = null;
  try {
    rawCalories = await fetchCaloriesRollup(session.accessToken, localDate);
  } catch (e) {
    rawCaloriesError = e instanceof Error ? e.message : String(e);
  }

  // Load stored snapshots from DB.
  const storedRows = userId
    ? await db.dailyHealthSnapshot.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 7,
      })
    : [];

  // Compute what the dashboard would show from stored data.
  let computedBaseline = null;
  if (userId) {
    const history = await loadSnapshots(userId, localDate);
    const today = history.find((s) => s.date === localDate) ?? {
      date: localDate,
      sleepMinutes: null, sleepEfficiency: null, sleepDeepMin: null,
      sleepRemMin: null, sleepLightMin: null,
      restingHr: null, hrv: null, steps: null, activeMinutes: null, totalCalories: null,
    };
    computedBaseline = computeBaseline(history, today);
  }

  return Response.json({
    session: {
      userId,
      email: session.user?.email,
      hasAccessToken: !!session.accessToken,
      tokenExpiresAt: expiresAt,
      tokenSecondsRemaining: tokenAge,
      tokenExpired: tokenAge !== null && tokenAge < 0,
      sessionError: session.error,
    },
    rawSnapshot,
    rawError,
    rawWorkouts,
    rawWorkoutsError,
    rawTotalCalories: rawCalories,
    rawCaloriesError,
    storedRows,
    computedBaseline,
  });
}
