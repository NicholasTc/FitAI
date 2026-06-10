/**
 * Debug endpoint — exposes session state, token expiry, raw API responses,
 * and stored DB snapshots. Only use during development.
 */
import { auth } from "@/lib/auth";
import { fetchDaySnapshot } from "@/lib/health";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();

  if (!session?.accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = (session as { expiresAt?: number }).expiresAt;
  const tokenAge = expiresAt ? expiresAt - now : null;

  // Fetch today's snapshot raw from the API (bypasses DB).
  const localDate = new Date().toLocaleDateString("en-CA");
  let rawSnapshot = null;
  let rawError = null;
  try {
    rawSnapshot = await fetchDaySnapshot(session.accessToken, localDate);
  } catch (e) {
    rawError = e instanceof Error ? e.message : String(e);
  }

  // Load stored snapshots from DB.
  const userId = session.user?.id;
  const storedRows = userId
    ? await db.dailyHealthSnapshot.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 7,
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
    },
    rawSnapshot,
    rawError,
    storedRows,
  });
}
