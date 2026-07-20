/**
 * Home sync cooldown — at most one syncUserHealth attempt per user per N minutes.
 *
 * In-memory for the running process; falls back to today's syncedAt so cold starts
 * / multi-instance still avoid hammering Google right after a successful today sync.
 */

import { db } from "@/lib/db";
import {
  GOOGLE_HEALTH_LOG_PREFIX,
  GOOGLE_HEALTH_SYNC,
} from "@/lib/googleHealth/config";

const lastAttemptByUserDay = new Map<string, number>();

function key(userId: string, today: string): string {
  return `${userId}:${today}`;
}

export function markHomeSyncAttempt(userId: string, today: string, atMs = Date.now()): void {
  lastAttemptByUserDay.set(key(userId, today), atMs);
}

/**
 * Returns remaining cooldown ms if Home should skip starting a sync; otherwise 0.
 */
export async function homeSyncCooldownRemainingMs(
  userId: string,
  today: string,
): Promise<number> {
  const { homeSyncCooldownMs } = GOOGLE_HEALTH_SYNC;
  const now = Date.now();
  const k = key(userId, today);

  const mem = lastAttemptByUserDay.get(k);
  if (mem !== undefined) {
    const remaining = homeSyncCooldownMs - (now - mem);
    if (remaining > 0) return remaining;
  }

  // Cold start / other instance: use today's last successful write as a proxy.
  const todayRow = await db.dailyHealthSnapshot.findUnique({
    where: { userId_date: { userId, date: today } },
    select: { syncedAt: true },
  });
  if (!todayRow) return 0;

  const age = now - todayRow.syncedAt.getTime();
  if (age >= homeSyncCooldownMs) return 0;

  // Warm memory so subsequent checks in this process are cheap.
  lastAttemptByUserDay.set(k, todayRow.syncedAt.getTime());
  const remaining = homeSyncCooldownMs - age;
  console.info(
    `${GOOGLE_HEALTH_LOG_PREFIX} cooldown-db-fallback user=${userId} ` +
      `today=${today} remainingMs=${remaining}`,
  );
  return remaining;
}
