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
}

// Seven-day rolling baselines. null when fewer than 2 data points available.
export interface WeeklyBaseline {
  sleepMinutes: number | null;
  sleepEfficiency: number | null;
  restingHr: number | null;
  hrv: number | null;
  steps: number | null;
  activeMinutes: number | null;

  // How many days have data (out of the last 7 attempted).
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
  };
  // Past 7 days ordered oldest → newest (for sparklines).
  history: DailySnapshot[];
}
