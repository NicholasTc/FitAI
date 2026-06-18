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

// Phase 0: per-component score breakdown stored in ScoreAudit and passed through UI.
export interface ScoreBreakdown {
  subjective: {
    score: number;
    maxPts: number;
    present: boolean;
  } | null;
  sleep: {
    score: number;
    maxPts: number;
    dataSource: "real" | "neutral";
    minutes: number | null;
    stageBonus: number; // Phase 1c adjustment from deep+REM proportion
  };
  hrv: {
    score: number;
    maxPts: number;
    dataSource: "real" | "neutral";
    method: "z-score" | "ratio" | "neutral"; // Phase 2: z-score when ≥14 days
    z?: number; // z-score value when method === "z-score"
  };
  restingHr: {
    score: number;
    maxPts: number;
    dataSource: "real" | "neutral";
    method: "z-score" | "ratio" | "neutral";
    z?: number;
  };
  activity: {
    score: number;
    maxPts: number;
    timeOfDayAdjusted: boolean; // Phase 1a: true when same-day steps treated as neutral
    stepsSource: "real" | "neutral";
    efficiencySource: "real" | "neutral";
  };
  trainingLoad: {
    modifier: number;                             // ±10 Phase 3
    method: "manual-acute-chronic" | "acute-chronic" | "insufficient-data";
    ratio: number | null;                         // acute/chronic ratio
  };
}

export interface ReadinessResult {
  score: number;      // 0–100
  dayType: DayType;
  reasons: ReadinessReason[];
  // Sub-scores for transparency
  subjectiveScore: number;  // 0–50
  objectiveScore: number;   // 0–50
  hasCheckIn: boolean;
  // Phase 0+: accuracy tracking fields
  confidence: "high" | "medium" | "low"; // based on how many real signals are present
  dataCompleteness: number;               // 0–1 fraction of key signals that are real data
  breakdown: ScoreBreakdown;              // per-component contribution
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
  // Phase A: biometric profile
  age:      number | null; // years
  sex:      "male" | "female" | null;
  heightCm: number | null; // cm
  weightKg: number | null; // kg
}

export const DEFAULT_SETTINGS: UserSettings = {
  wakeTime: "07:00",
  sleepTargetTime: "23:00",
  deepWorkLabel: "Deep work",
  lightWorkLabel: "Admin / Comms",
  age:      null,
  sex:      null,
  heightCm: null,
  weightKg: null,
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
    totalCalories: number | null;
  };
  baseline: {
    sleepMinutes: number | null;
    restingHr: number | null;
    hrv: number | null;
    steps: number | null;
    totalCalories: number | null;
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
