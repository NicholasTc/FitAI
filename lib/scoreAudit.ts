/**
 * Score audit — Phase 0 instrumentation.
 *
 * Persists each day's readiness score + a full per-component breakdown to the
 * ScoreAudit table. This is the foundation that makes every later accuracy
 * improvement verifiable: we can compare old vs. new scores over historical days
 * and track the agreement rate between predictions and reflections.
 *
 * Rules:
 * - Upsert only (re-loads overwrite the same row, never duplicate).
 * - Fire-and-forget: audit failures must NEVER crash the main /api/today request.
 * - No user-visible output — purely internal record-keeping.
 */

import { db } from "@/lib/db";
import type { ReadinessResult } from "@/types/today";

/**
 * Derive the scoring method label from the breakdown for the audit record.
 * Reflects the most advanced method that was actually used this day.
 */
function deriveMethod(result: ReadinessResult): string {
  const { hrv, restingHr, trainingLoad } = result.breakdown;
  const usedZScore = hrv.method === "z-score" || restingHr.method === "z-score";
  const usedLoad   = trainingLoad.method === "acute-chronic";
  if (usedZScore && usedLoad) return "z-score+load";
  if (usedZScore)             return "z-score";
  if (usedLoad)               return "load";
  return "legacy";
}

export async function recordScoreAudit(
  userId: string,
  date: string,
  result: ReadinessResult,
): Promise<void> {
  try {
    const method = deriveMethod(result);
    await db.scoreAudit.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        score:            result.score,
        dayType:          result.dayType,
        method,
        dataCompleteness: result.dataCompleteness,
        breakdown:        result.breakdown as object,
      },
      update: {
        score:            result.score,
        dayType:          result.dayType,
        method,
        dataCompleteness: result.dataCompleteness,
        breakdown:        result.breakdown as object,
      },
    });
  } catch {
    // Silently swallow — audit failures must not surface to the user.
  }
}
