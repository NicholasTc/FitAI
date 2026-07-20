/**
 * Per-user sync single-flight + dedupe.
 *
 * - Identical jobKey while in flight → join the same Promise (refresh spam safe).
 * - Different job for the same user → wait for the active job, then run.
 * - At most one Google Health sync job runs per user at a time.
 */

import { GOOGLE_HEALTH_LOG_PREFIX } from "@/lib/googleHealth/config";

interface ActiveJob {
  key: string;
  promise: Promise<unknown>;
}

const activeByUser = new Map<string, ActiveJob>();

export async function runExclusiveUserSync<T>(
  userId: string,
  jobKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  for (;;) {
    const existing = activeByUser.get(userId);
    if (existing) {
      if (existing.key === jobKey) {
        console.info(
          `${GOOGLE_HEALTH_LOG_PREFIX} dedupe user=${userId} job=${jobKey} — joining in-flight sync`,
        );
        return existing.promise as Promise<T>;
      }
      console.info(
        `${GOOGLE_HEALTH_LOG_PREFIX} queue user=${userId} job=${jobKey} — waiting for job=${existing.key}`,
      );
      try {
        await existing.promise;
      } catch {
        // Prior job failed; still proceed with ours.
      }
      continue;
    }

    // Claim the slot synchronously before any await so parallel callers see us.
    let settle!: (value: T | PromiseLike<T>) => void;
    let fail!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      settle = res;
      fail = rej;
    });
    activeByUser.set(userId, { key: jobKey, promise });

    console.info(`${GOOGLE_HEALTH_LOG_PREFIX} start user=${userId} job=${jobKey}`);
    try {
      const result = await fn();
      settle(result);
      return result;
    } catch (err) {
      fail(err);
      throw err;
    } finally {
      if (activeByUser.get(userId)?.promise === promise) {
        activeByUser.delete(userId);
        console.info(`${GOOGLE_HEALTH_LOG_PREFIX} done user=${userId} job=${jobKey}`);
      }
    }
  }
}
