/**
 * GET /api/today
 *
 * Returns the full TodayState for the requesting user:
 *   - Syncs last 7 days from Google Health API
 *   - Loads today's snapshot + history
 *   - Loads today's check-in (if any)
 *   - Computes readiness score and day type
 */

import { auth } from "@/lib/auth";
import { computeBaseline } from "@/lib/baseline";
import { computeReadiness } from "@/lib/readiness";
import { loadSnapshots, syncUserSnapshots } from "@/lib/sync";
import { db } from "@/lib/db";
import type { CheckInData, TodayState } from "@/types/today";
import type { DailySnapshot } from "@/types/snapshot";
import { type NextRequest, NextResponse } from "next/server";

const NULL_SNAPSHOT = (date: string): DailySnapshot => ({
  date,
  sleepMinutes: null,
  sleepEfficiency: null,
  sleepDeepMin: null,
  sleepRemMin: null,
  sleepLightMin: null,
  restingHr: null,
  hrv: null,
  steps: null,
  activeMinutes: null,
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json(
      { error: "Token expired. Please sign out and sign in again." },
      { status: 401 },
    );
  }

  const date =
    request.nextUrl.searchParams.get("date") ??
    new Date().toISOString().slice(0, 10);

  // 1. Sync fresh data (best-effort — don't fail the whole request if this fails)
  if (session.accessToken) {
    try {
      await syncUserSnapshots(session.user.id, session.accessToken, date);
    } catch {
      // Silent — stale DB data is still useful
    }
  }

  // 2. Load history + today's snapshot
  const history = await loadSnapshots(session.user.id, date);
  const today = history.find((s) => s.date === date) ?? NULL_SNAPSHOT(date);
  const { baseline } = computeBaseline(history, today);

  // 3. Load today's check-in
  const rawCheckIn = await db.checkIn.findUnique({
    where: { userId_date: { userId: session.user.id, date } },
  });

  const checkIn: CheckInData | null = rawCheckIn
    ? {
        date: rawCheckIn.date,
        energyLevel: rawCheckIn.energyLevel,
        stressLevel: rawCheckIn.stressLevel,
        sleepQuality: rawCheckIn.sleepQuality,
        motivation: rawCheckIn.motivation,
      }
    : null;

  // 4. Compute readiness
  const readiness = computeReadiness(today, baseline, checkIn);

  // 5. Build response
  const state: TodayState = {
    date,
    readiness,
    checkIn,
    snapshot: {
      sleepMinutes: today.sleepMinutes,
      sleepEfficiency: today.sleepEfficiency,
      sleepDeepMin: today.sleepDeepMin,
      sleepRemMin: today.sleepRemMin,
      sleepLightMin: today.sleepLightMin,
      restingHr: today.restingHr,
      hrv: today.hrv,
      steps: today.steps,
    },
    baseline: {
      sleepMinutes: baseline.sleepMinutes,
      restingHr: baseline.restingHr,
      hrv: baseline.hrv,
      steps: baseline.steps,
      daysWithData: baseline.daysWithData,
      status: baseline.status,
    },
    history: history.map((s, i) => {
      let dayType: import("@/types/today").DayType | null = null;

      if (s.date === date) {
        // Today — use the full readiness result (already computed with check-in)
        dayType = readiness.dayType;
      } else {
        // Past day — compute objective-only readiness using all OTHER days as prior
        const prior = history.filter((_, j) => j !== i);
        const { baseline: dayBaseline } = computeBaseline(prior, s);
        // Only compute if there's at least one prior data point so the
        // baseline isn't completely blind.
        const hasAnyData =
          s.sleepMinutes !== null ||
          s.restingHr !== null ||
          s.hrv !== null ||
          s.steps !== null;
        if (hasAnyData) {
          const { dayType: dt } = computeReadiness(s, dayBaseline, null);
          dayType = dt;
        }
      }

      return {
        date: s.date,
        dayType,
        sleepMinutes: s.sleepMinutes,
        restingHr: s.restingHr,
        hrv: s.hrv,
        steps: s.steps,
      };
    }),
  };

  return NextResponse.json(state);
}
