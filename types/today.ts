import type { FitAIIconName } from "@/types/icons";
import type { WorkoutSession } from "@/lib/health";

export type { WorkoutSession };

export type DayType = "push" | "maintain" | "recover";

export interface CheckInData {
  date: string;       // YYYY-MM-DD
  energyLevel: number;   // 1–10
  stressLevel: number;   // 1–10 (higher = more stressed)
  sleepQuality: number;  // 1–10 subjective
  motivation: number;    // 1–10
}

export interface ReadinessResult {
  score: number;      // 0–100
  dayType: DayType;
  reasons: ReadinessReason[];
  // Sub-scores for transparency
  subjectiveScore: number;  // 0–50
  objectiveScore: number;   // 0–50
  hasCheckIn: boolean;
}

export interface ReadinessReason {
  icon: FitAIIconName;
  title: string;
  detail: string;
  sentiment: "positive" | "caution" | "negative" | "neutral";
}

export interface UserSettings {
  wakeTime: string;        // "HH:MM" 24h
  sleepTargetTime: string; // "HH:MM" 24h
  deepWorkLabel: string;
  lightWorkLabel: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  wakeTime: "07:00",
  sleepTargetTime: "23:00",
  deepWorkLabel: "Deep work",
  lightWorkLabel: "Admin / Comms",
};

export interface TodayState {
  date: string;
  readiness: ReadinessResult;
  checkIn: CheckInData | null;
  lastWorkout: WorkoutSession | null;
  snapshot: {
    sleepMinutes: number | null;
    sleepEfficiency: number | null;
    sleepDeepMin: number | null;
    sleepRemMin: number | null;
    sleepLightMin: number | null;
    restingHr: number | null;
    hrv: number | null;
    steps: number | null;
  };
  baseline: {
    sleepMinutes: number | null;
    restingHr: number | null;
    hrv: number | null;
    steps: number | null;
    daysWithData: number;
    status: "forming" | "ready";
  };
  settings: UserSettings;
  history: Array<{
    date: string;
    /** Computed objective-only readiness day type. null when insufficient data. */
    dayType: DayType | null;
    sleepMinutes: number | null;
    restingHr: number | null;
    hrv: number | null;
    steps: number | null;
  }>;
}
