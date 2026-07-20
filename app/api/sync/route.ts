import { auth } from "@/lib/auth";
import { computeBaseline } from "@/lib/baseline";
import {
  GOOGLE_HEALTH_LOG_PREFIX,
  GOOGLE_HEALTH_SYNC,
} from "@/lib/googleHealth/config";
import { loadSnapshots, syncUserSnapshots, MAX_BACKFILL_DAYS } from "@/lib/sync";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.accessToken || !session.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.error) {
    return Response.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 },
    );
  }

  const date =
    request.nextUrl.searchParams.get("date") ??
    new Date().toISOString().slice(0, 10);

  // Optional days param — History opt-in backfill (max 90). Default 7 for light sync.
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam
    ? Math.min(Math.max(1, parseInt(daysParam, 10)), MAX_BACKFILL_DAYS)
    : 7;

  const isHistoryBackfill = days >= GOOGLE_HEALTH_SYNC.historyBackfillDays;
  if (isHistoryBackfill) {
    console.info(
      `${GOOGLE_HEALTH_LOG_PREFIX} history-backfill start user=${session.user.id} ` +
        `days=${days} date=${date}`,
    );
  }

  const result = await syncUserSnapshots(session.user.id, session.accessToken, date, days);

  if (isHistoryBackfill) {
    console.info(
      `${GOOGLE_HEALTH_LOG_PREFIX} history-backfill done user=${session.user.id} ` +
        `fetched=${result.daysSynced} skipped=${result.daysSkipped} ` +
        `withData=${result.daysWithAnyData} error=${result.apiError ?? "none"}`,
    );
  }

  const history = await loadSnapshots(session.user.id, date, days);
  const today = history.find((s) => s.date === date) ?? {
    date,
    sleepMinutes: null,
    sleepEfficiency: null,
    sleepDeepMin: null,
    sleepRemMin: null,
    sleepLightMin: null,
    sleepAwakeMin: null,
    restingHr: null,
    hrv: null,
    steps: null,
    activeMinutes: null,
    totalCalories: null,
    fatBurnMin: null,
    cardioMin: null,
    peakMin: null,
  };

  const baseline = computeBaseline(history, today);

  return Response.json({ ...baseline, sync: result });
}
