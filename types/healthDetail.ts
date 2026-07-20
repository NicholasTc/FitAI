/**
 * Shared response shape for GET /api/health-detail.
 */

import type { WeeklyZoneMinutes } from "@/lib/zoneMinutes";
import type { RecoveryStatesResult } from "@/lib/recoveryStates";
import type { StimulusReserveResult } from "@/lib/stimulusReserve";
import type { WeeklyCardioPlan } from "@/lib/weeklyCardioPlan";

/** Recent Fitbit/wearable session awaiting optional post-workout check-in. */
export interface PendingWearableWorkout {
  id: string;
  date: string;
  typeLabel: string;
  durationMinutes: number;
  rpe: number | null;
}

export interface HealthDetailResponse {
  date: string;
  zones: WeeklyZoneMinutes;
  recovery: RecoveryStatesResult;
  reserve: StimulusReserveResult;
  weeklyPlan: WeeklyCardioPlan;
  /** Most recent wearable session (last 2 days) without feedback yet. */
  pendingWearableWorkout: PendingWearableWorkout | null;
}
