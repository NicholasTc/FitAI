/**
 * Debug endpoint — exposes session state, token expiry, raw API responses,
 * and stored DB snapshots. Only use during development.
 */
import { auth } from "@/lib/auth";
import { computeBaseline } from "@/lib/baseline";
import { fetchDaySnapshot, fetchRecentWorkouts } from "@/lib/health";
import { googleHealthFetch } from "@/lib/googleHealth/rateLimiter";
import { loadSnapshots } from "@/lib/sync";
import { db } from "@/lib/db";
import { emptySnapshot } from "@/types/snapshot";

const HEALTH_API_BASE = "https://health.googleapis.com/v4";

function parseCivilDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

async function fetchCaloriesRollup(
  userId: string,
  accessToken: string,
  date: string,
) {
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

  const result = await googleHealthFetch<{
    rollupDataPoints?: Array<{ totalCalories?: { kcalSum?: number } }>;
  }>(
    userId,
    `${HEALTH_API_BASE}/users/me/dataTypes/total-calories/dataPoints:dailyRollUp`,
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  return {
    status: result.status,
    ok: result.ok,
    raw: result.data ?? { error: result.error },
    parsed:
      result.data?.rollupDataPoints?.[0]?.totalCalories?.kcalSum ?? null,
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
    if (!userId) throw new Error("Missing user id");
    const result = await fetchDaySnapshot(userId, session.accessToken, localDate);
    rawSnapshot = result.snapshot;
    rawError = result.apiError;
  } catch (e) {
    rawError = e instanceof Error ? e.message : String(e);
  }

  // Probe Google tokeninfo for scopes actually on the access token
  let tokenInfo: {
    scope?: string;
    expires_in?: string;
    error?: string;
    error_description?: string;
  } | null = null;
  try {
    const tiRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(session.accessToken)}`,
      { cache: "no-store" },
    );
    tokenInfo = (await tiRes.json()) as typeof tokenInfo;
  } catch (e) {
    tokenInfo = { error: e instanceof Error ? e.message : String(e) };
  }

  // Fetch raw exercise data from the API for the last 7 days.
  const sevenDaysAgo = new Date(localDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const windowStart = sevenDaysAgo.toISOString().slice(0, 10);

  let rawWorkouts = null;
  let rawWorkoutsError = null;
  try {
    if (!userId) throw new Error("Missing user id");
    rawWorkouts = await fetchRecentWorkouts(
      userId,
      session.accessToken,
      windowStart,
      localDate,
    );
  } catch (e) {
    rawWorkoutsError = e instanceof Error ? e.message : String(e);
  }

  // Probe: total-calories + active-energy-burned for today.
  let rawCalories = null;
  let rawCaloriesError = null;
  try {
    if (!userId) throw new Error("Missing user id");
    rawCalories = await fetchCaloriesRollup(userId, session.accessToken, localDate);
  } catch (e) {
    rawCaloriesError = e instanceof Error ? e.message : String(e);
  }

  // Load stored snapshots from DB (28-day window for full baseline visibility).
  const storedRows = userId
    ? await db.dailyHealthSnapshot.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 28,
      })
    : [];

  // Compute what the dashboard would show from stored data.
  let computedBaseline = null;
  if (userId) {
    const history = await loadSnapshots(userId, localDate, 28);
    const today = history.find((s) => s.date === localDate) ?? emptySnapshot(localDate);
    computedBaseline = computeBaseline(history, today);
  }

  // Phase 0: recent score audit rows (last 14 days)
  const recentAudit = userId
    ? await db.scoreAudit.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 14,
      })
    : [];

  return Response.json({
    session: {
      userId,
      email: session.user?.email,
      hasAccessToken: !!session.accessToken,
      tokenExpiresAt: expiresAt,
      tokenSecondsRemaining: tokenAge,
      tokenExpired: tokenAge !== null && tokenAge < 0,
      sessionError: session.error,
      grantedScopesFromJwt: session.grantedScopes ?? null,
      tokenInfoScopes: tokenInfo?.scope ?? null,
      hasHealthScopes: (() => {
        const scopes = tokenInfo?.scope ?? session.grantedScopes ?? "";
        return [
          "googlehealth.activity_and_fitness.readonly",
          "googlehealth.health_metrics_and_measurements.readonly",
          "googlehealth.sleep.readonly",
        ].every((s) => scopes.includes(s));
      })(),
    },
    tokenInfo,
    rawSnapshot,
    rawError,
    rawWorkouts,
    rawWorkoutsError,
    rawTotalCalories: rawCalories,
    rawCaloriesError,
    storedRows,
    computedBaseline,
    recentAudit,
  });
}
