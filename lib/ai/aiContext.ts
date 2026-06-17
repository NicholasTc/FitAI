/**
 * Builds a structured context block for the Gemini prompt.
 *
 * Uses the same metric-status helpers as the UI so the AI and the dashboard
 * always describe the same situation in the same words.
 */

import { hrvStatus, rhrStatus, sleepStatus } from "@/lib/metricStatus";
import type { DailySnapshot } from "@/types/snapshot";
import type { CheckInData, DayType, WorkoutSession } from "@/types/today";
import type { WeeklyBaseline } from "@/types/snapshot";

function fmtSleep(minutes: number | null): string | null {
  if (minutes === null) return null;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function round(v: number | null, decimals = 0): string | null {
  if (v === null) return null;
  return v.toFixed(decimals);
}

/**
 * Returns a plain-JSON context string to embed in the Gemini prompt.
 */
export function buildAiContext(
  snapshot: DailySnapshot,
  baseline: WeeklyBaseline,
  checkIn: CheckInData | null,
  dayType: DayType,
  readinessScore: number,
  date: string,
  tasks?: string[],
  lastWorkout?: WorkoutSession | null,
): string {
  // Metric statuses — same as UI
  const sleepSt = sleepStatus(
    {
      sleepMinutes: snapshot.sleepMinutes,
      sleepDeepMin: snapshot.sleepDeepMin,
      sleepRemMin: snapshot.sleepRemMin,
    },
    date,
  );

  const hrvSt = hrvStatus(
    {
      hrv: snapshot.hrv,
      sleepMinutes: snapshot.sleepMinutes,
      sleepDeepMin: snapshot.sleepDeepMin,
    },
    date,
  );

  const rhrSt = rhrStatus(
    { restingHr: snapshot.restingHr, sleepMinutes: snapshot.sleepMinutes },
    date,
  );

  // Delta descriptions (positive for sleep/HRV/steps, negative for RHR)
  const sleepDelta =
    snapshot.sleepMinutes !== null && baseline.sleepMinutes !== null
      ? snapshot.sleepMinutes - baseline.sleepMinutes
      : null;

  const hrvDelta =
    snapshot.hrv !== null && baseline.hrv !== null
      ? snapshot.hrv - baseline.hrv
      : null;

  const rhrDelta =
    snapshot.restingHr !== null && baseline.restingHr !== null
      ? snapshot.restingHr - baseline.restingHr
      : null;

  const ctx = {
    date,
    dayType,
    readinessScore,

    sleep: {
      today:
        fmtSleep(snapshot.sleepMinutes) ??
        `${sleepSt?.label ?? "Not available"} — ${sleepSt?.sub ?? ""}`,
      yourAverage: fmtSleep(
        baseline.sleepMinutes !== null
          ? Math.round(baseline.sleepMinutes)
          : null,
      ),
      deltaMinutes: sleepDelta !== null ? Math.round(sleepDelta) : null,
      direction:
        sleepDelta !== null
          ? sleepDelta > 0
            ? "above average"
            : "below average"
          : null,
      stagesStatus:
        snapshot.sleepMinutes !== null && snapshot.sleepDeepMin === null
          ? "Stages still processing — night is still syncing"
          : null,
      efficiency:
        snapshot.sleepEfficiency !== null
          ? `${snapshot.sleepEfficiency}%`
          : null,
    },

    restingHR: {
      today:
        snapshot.restingHr !== null
          ? `${Math.round(snapshot.restingHr)} bpm`
          : `${rhrSt?.label ?? "Not available"} — ${rhrSt?.sub ?? ""}`,
      yourAverage:
        baseline.restingHr !== null
          ? `${Math.round(baseline.restingHr)} bpm`
          : null,
      deltaBpm: rhrDelta !== null ? Math.round(rhrDelta) : null,
      direction:
        rhrDelta !== null
          ? rhrDelta < 0
            ? "below average (positive signal)"
            : "above average (elevated)"
          : null,
    },

    hrv: {
      today:
        snapshot.hrv !== null
          ? `${snapshot.hrv.toFixed(1)} ms`
          : `${hrvSt?.label ?? "Not available"} — ${hrvSt?.sub ?? ""}`,
      yourAverage:
        baseline.hrv !== null ? `${baseline.hrv.toFixed(1)} ms` : null,
      deltaMs: hrvDelta !== null ? round(hrvDelta, 1) : null,
      direction:
        hrvDelta !== null
          ? hrvDelta > 0
            ? "above average (positive signal)"
            : "below average"
          : null,
    },

    steps: {
      today: snapshot.steps ?? "Pending",
      yourAverage:
        baseline.steps !== null ? Math.round(baseline.steps) : null,
    },

    totalCalories: snapshot.totalCalories !== null
      ? {
          today: `${snapshot.totalCalories} kcal`,
          yourAverage: baseline.totalCalories !== null
            ? `${Math.round(baseline.totalCalories)} kcal`
            : null,
          delta: snapshot.totalCalories !== null && baseline.totalCalories !== null
            ? Math.round(snapshot.totalCalories - baseline.totalCalories)
            : null,
          note: "Total calories = resting metabolic rate + activity. A value well below your average may indicate low activity, illness, or early-day sync.",
        }
      : { note: "Total calories not yet available — likely pending end-of-day Fitbit sync." },

    subjectiveCheckIn: checkIn
      ? {
          energy: `${checkIn.energyLevel}/10`,
          stress: `${checkIn.stressLevel}/10 (higher = more stressed)`,
          sleepQuality: `${checkIn.sleepQuality}/10`,
          motivation: `${checkIn.motivation}/10`,
          note: "Subjective check-in is complete — treat this as the primary signal if it conflicts with wearable data. Do not address the user by name.",
        }
      : {
          note: "No check-in yet — readiness is based on wearable data only.",
        },

    baselineStatus: `${baseline.status} (${baseline.daysWithData}/6 prior days with data)`,

    lastWorkout: lastWorkout
      ? {
          date: lastWorkout.date,
          type: lastWorkout.typeLabel,
          durationMinutes: lastWorkout.durationMinutes,
          daysAgo: Math.round(
            (new Date(date).getTime() - new Date(lastWorkout.date).getTime()) /
              86400000,
          ),
          note:
            "Factor in accumulated fatigue from this session when advising on today's capacity.",
        }
      : { note: "No exercise sessions recorded in the past 7 days." },

    todaysPlannedTasks:
      tasks && tasks.length > 0 ? tasks : "No tasks provided",
  };

  return JSON.stringify(ctx, null, 2);
}
