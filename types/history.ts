/**
 * History / Calendar types — Phase History.
 *
 * The calendar is built around manual logs (check-in, reflection, workout).
 * Wearable metrics are secondary context, present only when stored.
 */

export interface HistoryDaySummary {
  date: string; // YYYY-MM-DD

  // Manual activity flags — these drive calendar visibility
  hasCheckIn:    boolean;
  hasReflection: boolean;
  workoutCount:  number;  // count of manual WorkoutSession rows for this day

  // App recommendation stored at time of load (ScoreAudit)
  // null = user never opened Today view for this day
  dayType:        "push" | "maintain" | "recover" | null;
  readinessScore: number | null;
  confidence:     "high" | "medium" | "low" | null;

  // Quick preview for calendar cell / tooltip
  reflectionAccuracy: "yes" | "somewhat" | "no" | null;
  reflectionOutcome:  "great" | "good" | "skipped" | "rest" | null;
}

export interface HistoryWorkout {
  id:              string;
  typeLabel:       string;
  durationMinutes: number;
  rpe:             number;
  sessionLoad:     number;
}

export interface HistoryDayDetail extends HistoryDaySummary {
  checkIn: {
    energyLevel:  number;
    stressLevel:  number;
    sleepQuality: number;
    motivation:   number;
  } | null;

  reflection: {
    accuracy: "yes" | "somewhat" | "no";
    outcome:  "great" | "good" | "skipped" | "rest";
    note:     string | null;
  } | null;

  workouts: HistoryWorkout[];

  // Wearable context — only when DailyHealthSnapshot row exists for this date.
  // null = day was never synced from Fitbit while the app was open.
  snapshot: {
    sleepMinutes:    number | null;
    sleepDeepMin:    number | null;
    sleepRemMin:     number | null;
    sleepEfficiency: number | null;
    hrv:             number | null;
    restingHr:       number | null;
    steps:           number | null;
    totalCalories:   number | null;
  } | null;

  // Score breakdown — present when ScoreAudit row exists
  scoreAudit: {
    score:            number;
    dayType:          string;
    method:           string;
    dataCompleteness: number;
  } | null;
}

export interface HistoryMonthStats {
  reflectionsSubmitted: number;
  checkInsSubmitted:    number;
  workoutsLogged:       number;
  accuracyYes:          number;
  accuracySomewhat:     number;
  accuracyNo:           number;
}

export interface HistoryMonthResponse {
  month:               string;  // YYYY-MM
  earliestManualDate:  string | null;  // null = no manual logs exist at all
  latestManualDate:    string | null;
  days:                HistoryDaySummary[];
  stats:               HistoryMonthStats;
}

export interface HistoryBoundsResponse {
  earliestDate: string | null; // null = no manual logs yet
  latestDate:   string | null;
}
