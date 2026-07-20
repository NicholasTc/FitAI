/**
 * Centralized Google Health API rate-limit / retry settings.
 *
 * Google default: ~300 requests/min/user (~5 QPS).
 * Unverified apps can be closer to ~2.5 QPS (~150/min).
 * We stay well under both with a conservative per-user RPM cap.
 *
 * Tune here only — do not scatter magic numbers in callers.
 */

export const GOOGLE_HEALTH_RATE_LIMIT = {
  /** Max in-flight Google Health HTTP requests per user. */
  maxConcurrent: 3,

  /**
   * Max Google Health HTTP requests started per user per rolling 60s window.
   * Kept under unverified (~150/min) and verified (~300/min) defaults.
   */
  maxRequestsPerMinute: 100,

  /** Max attempts per request (initial try + retries). */
  maxAttempts: 5,

  /** Base delay for exponential backoff when Retry-After is absent (ms). */
  baseBackoffMs: 500,

  /** Cap on backoff delay (ms). */
  maxBackoffMs: 20_000,

  /** Extra random jitter added to backoff (0–jitterMs). */
  jitterMs: 250,
} as const;

/**
 * Per-day sync freshness — skip Google fetches when DB data is still good.
 * Tune here only.
 */
export const GOOGLE_HEALTH_SYNC = {
  /**
   * Re-fetch "today" after this age. Short so steps/calories/late sleep catch up
   * without re-pulling the whole week on every Home load.
   */
  todayFreshnessMs: 15 * 60 * 1000, // 15 minutes

  /**
   * Re-fetch past days after this age. Overnight metrics rarely change once settled.
   */
  pastDayFreshnessMs: 12 * 60 * 60 * 1000, // 12 hours

  /**
   * Home (`/api/today`) will not start another health sync job more often than this.
   * Shorter than todayFreshnessMs so after cooldown we can still retry empty past days
   * without re-pulling today. Explicit `/api/sync` (History) bypasses this.
   */
  homeSyncCooldownMs: 5 * 60 * 1000, // 5 minutes

  /**
   * Opt-in History wearable backfill window (days).
   * Never auto-run on calendar open — only via explicit "Catch up".
   */
  historyBackfillDays: 30,

  /**
   * Home serves DB immediately and runs Google sync in `after()` when due.
   */
  backgroundHomeSync: true,

  /**
   * Google limit for active-minutes / total-calories dailyRollUp range.
   * Other types allow up to 90 days.
   */
  constrainedRollupMaxDays: 14,

  /** Max range span for sleep / RHR / HRV / steps batch reads. */
  defaultRangeMaxDays: 90,
} as const;

/** Log prefix for sync / rate-limit diagnostics. */
export const GOOGLE_HEALTH_LOG_PREFIX = "[google-health]";
