// Normalized shape for a single day's health data stored in the DB.
// All wearable fields are nullable — they populate as the Fitbit calibrates.
export interface DailySnapshot {
  date: string; // YYYY-MM-DD

  // Sleep
  sleepMinutes: number | null;
  sleepEfficiency: number | null; // 0–100 %
  sleepDeepMin: number | null;
  sleepRemMin: number | null;
  sleepLightMin: number | null;

  // Cardiac
  restingHr: number | null; // bpm
  hrv: number | null; // ms

  // Activity
  steps: number | null;
  activeMinutes: number | null;
  totalCalories: number | null; // kcal
}

// Seven-day (or longer) rolling baselines.
// null when fewer than 2 data points available for a given metric.
export interface WeeklyBaseline {
  // Rolling means
  sleepMinutes: number | null;
  sleepEfficiency: number | null;
  restingHr: number | null;
  hrv: number | null;
  steps: number | null;
  activeMinutes: number | null;
  totalCalories: number | null;

  // Phase 2: per-metric standard deviations + sample counts.
  // SD is null when fewer than 3 valid observations exist.
  // Gates z-score scoring: only activates when n >= 14 AND sd is non-trivial.
  sdHrv: number | null;
  sdRestingHr: number | null;
  sdSleepMinutes: number | null;
  nHrv: number;          // count of valid HRV observations
  nRestingHr: number;    // count of valid RHR observations
  nSleepMinutes: number; // count of valid sleep observations

  // How many days have ANY data (out of the loaded window).
  daysWithData: number;
  // "forming" when daysWithData < 5, "ready" when >= 5.
  status: "forming" | "ready";
}

// Delta between today and the 7-day average. null when baseline not available.
export interface MetricDelta {
  value: number | null; // absolute delta (today – avg)
  direction: "up" | "down" | "flat" | null;
}

export interface DailyBaseline {
  baseline: WeeklyBaseline;
  today: DailySnapshot;
  deltas: {
    sleepMinutes: MetricDelta;
    restingHr: MetricDelta;
    hrv: MetricDelta;
    steps: MetricDelta;
    activeMinutes: MetricDelta;
    totalCalories: MetricDelta;
  };
  // Past 7 days ordered oldest → newest (for sparklines).
  history: DailySnapshot[];
}
