import type { DayType } from "@/types/today";

export type TrendsRange = 7 | 30 | 90;

export interface TrendPoint {
  date: string;
  score: number | null;
  dayType: DayType | null;
  sleepMinutes: number | null;
  hrv: number | null;
  restingHr: number | null;
}

export interface TrendStats {
  readiness: number | null;
  sleepMinutes: number | null;
  hrv: number | null;
  restingHr: number | null;
}

export interface TrendsResponse {
  range: TrendsRange;
  points: TrendPoint[];
  /** Most recent non-null value in the current window (the "big" number). */
  current: TrendStats;
  /** Average across the current window. */
  averages: TrendStats;
  /** Average across the prior window of equal length (for deltas). */
  prior: TrendStats;
  /** current-window average minus prior-window average. */
  deltas: TrendStats;
  /** True when there is no prior window to compare against. */
  hasPrior: boolean;
  insight: string;
}
