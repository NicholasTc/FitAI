/**
 * GET /api/today
 *
 * Returns the full TodayState for the requesting user:
 *   - Loads today's snapshot + history from DB immediately
 *   - Schedules Google Health sync in the background when due
 *   - Loads today's check-in (if any)
 *   - Computes readiness score and day type
 */

import { auth, hasHealthScopes } from "@/lib/auth";
import { computeBaseline } from "@/lib/baseline";
import { computeReadiness } from "@/lib/readiness";
import { computeTrainingLoad, computeTrainingLoadFromManual, type ManualWorkoutSession } from "@/lib/trainingLoad";
import { recordScoreAudit } from "@/lib/scoreAudit";
import {
  GOOGLE_HEALTH_LOG_PREFIX,
  GOOGLE_HEALTH_SYNC,
} from "@/lib/googleHealth/config";
import { homeSyncCooldownRemainingMs } from "@/lib/googleHealth/homeCooldown";
import {
  loadSnapshots,
  syncUserHealth,
  loadLastWorkout,
  snapshotWindowStats,
} from "@/lib/sync";
import { db } from "@/lib/db";
import type { CheckInData, TodayState, UserSettings } from "@/types/today";
import { DEFAULT_SETTINGS } from "@/types/today";
import { emptySnapshot } from "@/types/snapshot";
import { after, type NextRequest, NextResponse } from "next/server";

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

  // 1. Auth / scope gates + optional background sync (do not block first paint)
  let syncStatus: NonNullable<TodayState["syncStatus"]> = { ok: true };
  const grantedScopes = session.grantedScopes;
  // Only treat as missing_scopes when we know what Google granted and Health is absent.
  // Old JWTs may lack grantedScopes until the user signs in again.
  const scopesKnownMissing =
    typeof grantedScopes === "string" &&
    grantedScopes.length > 0 &&
    !hasHealthScopes(grantedScopes);

  const windowStats = await snapshotWindowStats(session.user.id, date, 7);

  if (!session.accessToken) {
    syncStatus = {
      ok: false,
      code: "api_error",
      message: "No Google access token. Sign out and sign in again.",
      grantedScopes,
    };
  } else if (scopesKnownMissing) {
    syncStatus = {
      ok: false,
      code: "missing_scopes",
      message:
        "Google did not grant Health API scopes. Add the googlehealth.* scopes on your Google Cloud OAuth consent screen, then sign out and sign in again.",
      grantedScopes,
    };
  } else if (GOOGLE_HEALTH_SYNC.backgroundHomeSync) {
    const cooldownMs = await homeSyncCooldownRemainingMs(session.user.id, date);
    if (cooldownMs === 0) {
      const userId = session.user.id;
      const accessToken = session.accessToken;
      syncStatus = {
        ok: true,
        updating: true,
        message: "Updating health data in the background…",
        grantedScopes,
      };
      after(() => {
        console.info(
          `${GOOGLE_HEALTH_LOG_PREFIX} background-sync start user=${userId} date=${date}`,
        );
        void syncUserHealth(userId, accessToken, date)
          .then((result) => {
            console.info(
              `${GOOGLE_HEALTH_LOG_PREFIX} background-sync done user=${userId} ` +
                `fetched=${result.daysSynced} skipped=${result.daysSkipped} ` +
                `withData=${result.daysWithAnyData} error=${result.apiError ?? "none"}`,
            );
          })
          .catch((err) => {
            console.warn(
              `${GOOGLE_HEALTH_LOG_PREFIX} background-sync failed user=${userId} ` +
                `error=${err instanceof Error ? err.message : String(err)}`,
            );
          });
      });
    } else if (windowStats.daysWithAnyData === 0) {
      syncStatus = {
        ok: false,
        code: "empty",
        message:
          "No wearable data stored yet. Check that Fitbit is linked to Google Health, then wait a moment or use Catch up on History.",
        grantedScopes,
      };
    }
  } else {
    // Legacy blocking sync path (config off)
    try {
      const snapResult = await syncUserHealth(
        session.user.id,
        session.accessToken,
        date,
      );
      if (snapResult.apiError) {
        const err = snapResult.apiError.toLowerCase();
        const looksLikeAuth =
          err.includes("403") ||
          err.includes("401") ||
          err.includes("permission") ||
          err.includes("scope") ||
          err.includes("insufficient");
        syncStatus = {
          ok: false,
          code: looksLikeAuth ? "missing_scopes" : "api_error",
          message: looksLikeAuth
            ? `Health API denied access (${snapResult.apiError}). Google likely did not grant Health scopes — check Cloud Console OAuth scopes, then sign out and sign in again.`
            : snapResult.apiError,
          grantedScopes,
        };
      } else if (snapResult.daysWithAnyData === 0) {
        syncStatus = {
          ok: false,
          code: "empty",
          message:
            "Health API returned no data. Check that Fitbit is linked to Google Health and data has synced overnight.",
          grantedScopes,
        };
      }
    } catch (err) {
      syncStatus = {
        ok: false,
        code: "api_error",
        message: err instanceof Error ? err.message : "Health sync failed",
        grantedScopes,
      };
    }
  }

  // 2. Load history (28 days for stable z-score baselines) + today + last workout
  const windowStart2 = new Date(date);
  windowStart2.setDate(windowStart2.getDate() - 27); // 28-day window
  const sinceDate = windowStart2.toISOString().slice(0, 10);

  const [history, lastWorkout] = await Promise.all([
    loadSnapshots(session.user.id, date, 28), // Phase 2: up to 28 days
    loadLastWorkout(session.user.id, sinceDate),
  ]);
  const today = history.find((s) => s.date === date) ?? emptySnapshot(date);
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
        wakeTime:        rawSettings.wakeTime,
        sleepTargetTime: rawSettings.sleepTargetTime,
        deepWorkLabel:   rawSettings.deepWorkLabel,
        lightWorkLabel:  rawSettings.lightWorkLabel,
        age:             rawSettings.age,
        sex:             (rawSettings.sex as "male" | "female" | null) ?? null,
        heightCm:        rawSettings.heightCm,
        weightKg:        rawSettings.weightKg,
        weeklyModerateTargetMin:
          rawSettings.weeklyModerateTargetMin ??
          DEFAULT_SETTINGS.weeklyModerateTargetMin,
        weeklyVigorousTargetMin:
          rawSettings.weeklyVigorousTargetMin ??
          DEFAULT_SETTINGS.weeklyVigorousTargetMin,
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

  // 4. Compute training load (Phase B preferred: manual sessions; fallback: activeMinutes)
  const priorHistory = history.filter((s) => s.date !== date);

  const windowStart28 = new Date(date);
  windowStart28.setDate(windowStart28.getDate() - 27);
  const since28 = windowStart28.toISOString().slice(0, 10);

  const rawManualSessions = await db.workoutSession.findMany({
    where: { userId: session.user.id, isManual: true, date: { gte: since28 } },
    orderBy: { date: "desc" },
  });

  const manualSessions: ManualWorkoutSession[] = rawManualSessions
    .filter((s) => s.sessionLoad !== null)
    .map((s) => ({
      date:            s.date,
      sessionLoad:     s.sessionLoad!,
      durationMinutes: s.durationMinutes,
      rpe:             s.rpe ?? 5,
    }));

  const manualLoad = computeTrainingLoadFromManual(manualSessions, date);
  const trainingLoad = manualLoad.method !== "insufficient-data"
    ? manualLoad
    : computeTrainingLoad(priorHistory);

  // Phase A: user profile for age/sex-adjusted thresholds
  const userProfile = settings.age !== null || settings.sex !== null
    ? { age: settings.age, sex: settings.sex, heightCm: settings.heightCm, weightKg: settings.weightKg }
    : undefined;

  // 5. Compute readiness with all Phase 1–3 + Phase A options
  const readiness = computeReadiness(today, baseline, checkIn, {
    date,
    trainingLoad,
    userProfile,
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
    syncStatus,
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
