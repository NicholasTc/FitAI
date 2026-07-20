/**
 * GET /api/health-detail
 *
 * Lazy Health-tab payload: zone tracker, recovery states, stimulus reserve,
 * and adaptive weekly plan. Does not hit Google Health — reads DB only so
 * Home (/api/today) stays on the fast path.
 */

import { auth } from "@/lib/auth";
import { computeBaseline } from "@/lib/baseline";
import {
  computeTrainingLoad,
  computeTrainingLoadFromManual,
  computeTrainingLoadFromZones,
  type ManualWorkoutSession,
} from "@/lib/trainingLoad";
import { computeWeeklyZoneMinutes } from "@/lib/zoneMinutes";
import { computeRecoveryStates } from "@/lib/recoveryStates";
import { computeStimulusReserve } from "@/lib/stimulusReserve";
import { computeWeeklyCardioPlan } from "@/lib/weeklyCardioPlan";
import { loadSnapshots } from "@/lib/sync";
import { db } from "@/lib/db";
import { emptySnapshot } from "@/types/snapshot";
import { DEFAULT_SETTINGS } from "@/types/today";
import type { HealthDetailResponse } from "@/types/healthDetail";
import type { CheckInData } from "@/types/today";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date =
    request.nextUrl.searchParams.get("date") ??
    new Date().toLocaleDateString("en-CA");

  const history = await loadSnapshots(session.user.id, date, 28);
  const today = history.find((s) => s.date === date) ?? emptySnapshot(date);
  const { baseline } = computeBaseline(history, today);

  const windowStart = (() => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() - 27);
    return d.toISOString().slice(0, 10);
  })();
  const pendingSince = (() => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const [rawCheckIn, rawSettings, rawManual, pendingWearable] = await Promise.all([
    db.checkIn.findUnique({
      where: { userId_date: { userId: session.user.id, date } },
    }),
    db.userSettings.findUnique({ where: { userId: session.user.id } }),
    db.workoutSession.findMany({
      where: {
        userId: session.user.id,
        isManual: true,
        date: { gte: windowStart },
      },
      orderBy: { date: "desc" },
    }),
    db.workoutSession.findFirst({
      where: {
        userId: session.user.id,
        isManual: false,
        date: { gte: pendingSince, lte: date },
        feltDifficulty: null,
        perceivedPerformance: null,
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const checkIn: CheckInData | null = rawCheckIn
    ? {
        date: rawCheckIn.date,
        energyLevel: rawCheckIn.energyLevel,
        stressLevel: rawCheckIn.stressLevel,
        sleepQuality: rawCheckIn.sleepQuality,
        motivation: rawCheckIn.motivation,
      }
    : null;

  const targets = {
    weeklyModerateTargetMin:
      rawSettings?.weeklyModerateTargetMin ??
      DEFAULT_SETTINGS.weeklyModerateTargetMin,
    weeklyVigorousTargetMin:
      rawSettings?.weeklyVigorousTargetMin ??
      DEFAULT_SETTINGS.weeklyVigorousTargetMin,
  };

  const zones = computeWeeklyZoneMinutes(history, date, targets);

  const prior = history.filter((s) => s.date !== date);
  const zoneLoad = computeTrainingLoadFromZones(prior);
  const manualSessions: ManualWorkoutSession[] = rawManual
    .filter((s) => s.sessionLoad !== null)
    .map((s) => ({
      date: s.date,
      sessionLoad: s.sessionLoad!,
      durationMinutes: s.durationMinutes,
      rpe: s.rpe ?? 5,
    }));
  const manualLoad = computeTrainingLoadFromManual(manualSessions, date);
  const activeLoad = computeTrainingLoad(prior);

  const trainingLoad =
    zoneLoad.method !== "insufficient-data"
      ? zoneLoad
      : manualLoad.method !== "insufficient-data"
        ? manualLoad
        : activeLoad;

  const recovery = computeRecoveryStates(
    today,
    baseline,
    checkIn,
    trainingLoad,
  );
  const reserve = computeStimulusReserve(
    today,
    baseline,
    trainingLoad,
    checkIn,
  );
  const weeklyPlan = computeWeeklyCardioPlan(zones, reserve, date);

  const body: HealthDetailResponse = {
    date,
    zones,
    recovery,
    reserve,
    weeklyPlan,
    pendingWearableWorkout: pendingWearable
      ? {
          id: pendingWearable.id,
          date: pendingWearable.date,
          typeLabel: pendingWearable.typeLabel,
          durationMinutes: pendingWearable.durationMinutes,
          rpe: pendingWearable.rpe,
        }
      : null,
  };

  return NextResponse.json(body);
}
