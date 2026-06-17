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
import { computeTrainingLoad } from "@/lib/trainingLoad";
import { recordScoreAudit } from "@/lib/scoreAudit";
import {
  loadSnapshots,
  syncUserSnapshots,
  syncUserWorkouts,
  loadLastWorkout,
} from "@/lib/sync";
import { db } from "@/lib/db";
import type { CheckInData, TodayState, UserSettings } from "@/types/today";
import { DEFAULT_SETTINGS } from "@/types/today";
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
  totalCalories: null,
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
    const syncWindowStart = new Date(date);
    syncWindowStart.setDate(syncWindowStart.getDate() - 6);
    const syncSince = syncWindowStart.toISOString().slice(0, 10);

    await Promise.allSettled([
      syncUserSnapshots(session.user.id, session.accessToken, date),
      syncUserWorkouts(session.user.id, session.accessToken, syncSince, date),
    ]);
  }

  // 2. Load history (28 days for stable z-score baselines) + today + last workout
  const windowStart2 = new Date(date);
  windowStart2.setDate(windowStart2.getDate() - 27); // 28-day window
  const sinceDate = windowStart2.toISOString().slice(0, 10);

  const [history, lastWorkout] = await Promise.all([
    loadSnapshots(session.user.id, date, 28), // Phase 2: up to 28 days
    loadLastWorkout(session.user.id, sinceDate),
  ]);
  const today = history.find((s) => s.date === date) ?? NULL_SNAPSHOT(date);
  const { baseline } = computeBaseline(history, today);

  // 3. Load today's check-in + user settings (parallel)
  const [rawCheckIn, rawSettings] = await Promise.all([
    db.checkIn.findUnique({
      where: { userId_date: { userId: session.user.id, date } },
    }),
    db.userSettings.findUnique({ where: { userId: session.user.id } }),
  ]);

  const settings: UserSettings = rawSettings
    ? {
        wakeTime: rawSettings.wakeTime,
        sleepTargetTime: rawSettings.sleepTargetTime,
        deepWorkLabel: rawSettings.deepWorkLabel,
        lightWorkLabel: rawSettings.lightWorkLabel,
      }
    : DEFAULT_SETTINGS;

  const checkIn: CheckInData | null = rawCheckIn
    ? {
        date: rawCheckIn.date,
        energyLevel: rawCheckIn.energyLevel,
        stressLevel: rawCheckIn.stressLevel,
        sleepQuality: rawCheckIn.sleepQuality,
        motivation: rawCheckIn.motivation,
      }
    : null;

  // 4. Compute training load (Phase 3) from prior history (exclude today)
  const priorHistory = history.filter((s) => s.date !== date);
  const trainingLoad = computeTrainingLoad(priorHistory);

  // 5. Compute readiness with all Phase 1–3 options
  const readiness = computeReadiness(today, baseline, checkIn, {
    date,
    trainingLoad,
  });

  // Phase 0: persist score audit (fire-and-forget — never blocks the response)
  void recordScoreAudit(session.user.id, date, readiness);

  // 6. Build response
  const state: TodayState = {
    date,
    readiness,
    checkIn,
    lastWorkout,
    settings,
    snapshot: {
      sleepMinutes: today.sleepMinutes,
      sleepEfficiency: today.sleepEfficiency,
      sleepDeepMin: today.sleepDeepMin,
      sleepRemMin: today.sleepRemMin,
      sleepLightMin: today.sleepLightMin,
      restingHr: today.restingHr,
      hrv: today.hrv,
      steps: today.steps,
      totalCalories: today.totalCalories,
    },
    baseline: {
      sleepMinutes: baseline.sleepMinutes,
      restingHr: baseline.restingHr,
      hrv: baseline.hrv,
      steps: baseline.steps,
      totalCalories: baseline.totalCalories,
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
