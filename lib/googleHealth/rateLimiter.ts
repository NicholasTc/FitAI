/**
 * Per-user Google Health request gate:
 *   - concurrency cap (2–4 in flight)
 *   - rolling per-minute request budget (time-based, not just concurrency)
 *   - 429-aware retry with Retry-After or exponential backoff + jitter
 *
 * All Google Health HTTP calls should go through `googleHealthFetch`.
 */

import {
  GOOGLE_HEALTH_LOG_PREFIX,
  GOOGLE_HEALTH_RATE_LIMIT,
} from "@/lib/googleHealth/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoogleHealthFetchResult<T = unknown> {
  ok: boolean;
  status: number | null;
  data?: T;
  error?: string;
  /** True when we exhausted retries on 429 / transient failures. */
  rateLimited?: boolean;
}

// ─── Per-user limiter state ───────────────────────────────────────────────────

interface UserGate {
  active: number;
  /** Timestamps (ms) of request starts in the rolling window. */
  windowStarts: number[];
  /** Waiters blocked on concurrency. */
  waiters: Array<() => void>;
  requestCount: number;
  retryCount: number;
  throttleCount: number;
}

const gates = new Map<string, UserGate>();

function gateFor(userId: string): UserGate {
  let g = gates.get(userId);
  if (!g) {
    g = {
      active: 0,
      windowStarts: [],
      waiters: [],
      requestCount: 0,
      retryCount: 0,
      throttleCount: 0,
    };
    gates.set(userId, g);
  }
  return g;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneWindow(g: UserGate, now: number): void {
  const cutoff = now - 60_000;
  while (g.windowStarts.length > 0 && g.windowStarts[0]! < cutoff) {
    g.windowStarts.shift();
  }
}

function wakeNext(g: UserGate): void {
  const next = g.waiters.shift();
  if (next) next();
}

/**
 * Block until this user may start another Google Health request
 * (concurrency slot + per-minute budget).
 */
async function acquireSlot(userId: string): Promise<void> {
  const g = gateFor(userId);
  const { maxConcurrent, maxRequestsPerMinute } = GOOGLE_HEALTH_RATE_LIMIT;

  for (;;) {
    const now = Date.now();
    pruneWindow(g, now);

    const underConcurrency = g.active < maxConcurrent;
    const underRpm = g.windowStarts.length < maxRequestsPerMinute;

    if (underConcurrency && underRpm) {
      g.active += 1;
      g.windowStarts.push(now);
      g.requestCount += 1;
      return;
    }

    g.throttleCount += 1;

    if (!underConcurrency) {
      await new Promise<void>((resolve) => g.waiters.push(resolve));
      continue;
    }

    // RPM exhausted — sleep until the oldest request ages out of the window.
    const oldest = g.windowStarts[0] ?? now;
    const waitMs = Math.max(25, oldest + 60_000 - now + 15);
    console.info(
      `${GOOGLE_HEALTH_LOG_PREFIX} throttle user=${userId} reason=rpm ` +
        `active=${g.active} window=${g.windowStarts.length}/${maxRequestsPerMinute} waitMs=${waitMs}`,
    );
    await sleep(waitMs);
  }
}

function releaseSlot(userId: string): void {
  const g = gateFor(userId);
  g.active = Math.max(0, g.active - 1);
  wakeNext(g);
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const asInt = Number(header);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return Math.min(asInt * 1000, GOOGLE_HEALTH_RATE_LIMIT.maxBackoffMs);
  }
  const when = Date.parse(header);
  if (!Number.isNaN(when)) {
    return Math.min(Math.max(0, when - Date.now()), GOOGLE_HEALTH_RATE_LIMIT.maxBackoffMs);
  }
  return null;
}

function backoffMs(attempt: number): number {
  const { baseBackoffMs, maxBackoffMs, jitterMs } = GOOGLE_HEALTH_RATE_LIMIT;
  const exp = Math.min(maxBackoffMs, baseBackoffMs * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * jitterMs);
  return exp + jitter;
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 502;
}

/**
 * Rate-limited Google Health fetch with 429 / transient retries.
 * Pass the authenticated userId so limits are enforced per user.
 */
export async function googleHealthFetch<T = unknown>(
  userId: string,
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<GoogleHealthFetchResult<T>> {
  const { maxAttempts } = GOOGLE_HEALTH_RATE_LIMIT;
  let lastError = "Fetch failed";
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await acquireSlot(userId);
    let holdSlot = true;
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      });

      lastStatus = res.status;

      if (res.ok) {
        const data = (await res.json()) as T;
        if (attempt > 1) {
          console.info(
            `${GOOGLE_HEALTH_LOG_PREFIX} recovered user=${userId} attempt=${attempt} status=${res.status}`,
          );
        }
        return { ok: true, status: res.status, data };
      }

      let msg = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        msg = body.error?.message ?? msg;
      } catch {
        // keep default
      }
      lastError = msg;

      const retryable = shouldRetryStatus(res.status) && attempt < maxAttempts;
      if (!retryable) {
        if (res.status === 429) {
          console.warn(
            `${GOOGLE_HEALTH_LOG_PREFIX} failed user=${userId} status=429 attempts=${attempt} error=${msg}`,
          );
          return { ok: false, status: res.status, error: msg, rateLimited: true };
        }
        console.warn(
          `${GOOGLE_HEALTH_LOG_PREFIX} failed user=${userId} status=${res.status} attempts=${attempt} error=${msg}`,
        );
        return { ok: false, status: res.status, error: msg };
      }

      gateFor(userId).retryCount += 1;
      const retryAfter = parseRetryAfterMs(res.headers.get("retry-after"));
      const wait = retryAfter ?? backoffMs(attempt);
      console.warn(
        `${GOOGLE_HEALTH_LOG_PREFIX} retry user=${userId} status=${res.status} ` +
          `attempt=${attempt}/${maxAttempts} waitMs=${wait} ` +
          `retryAfter=${retryAfter !== null} error=${msg}`,
      );
      releaseSlot(userId);
      holdSlot = false;
      await sleep(wait);
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Fetch error";
      lastStatus = null;
      if (attempt >= maxAttempts) {
        console.warn(
          `${GOOGLE_HEALTH_LOG_PREFIX} network-failed user=${userId} attempts=${attempt} error=${lastError}`,
        );
        return { ok: false, status: null, error: lastError };
      }
      gateFor(userId).retryCount += 1;
      const wait = backoffMs(attempt);
      console.warn(
        `${GOOGLE_HEALTH_LOG_PREFIX} network-retry user=${userId} attempt=${attempt}/${maxAttempts} waitMs=${wait}`,
      );
      releaseSlot(userId);
      holdSlot = false;
      await sleep(wait);
    } finally {
      if (holdSlot) releaseSlot(userId);
    }
  }

  return {
    ok: false,
    status: lastStatus,
    error: lastError,
    rateLimited: lastStatus === 429,
  };
}

/** Snapshot of limiter counters for a user (for logs / debug). */
export function getGoogleHealthGateStats(userId: string): {
  requestCount: number;
  retryCount: number;
  throttleCount: number;
  active: number;
  windowSize: number;
} {
  const g = gateFor(userId);
  pruneWindow(g, Date.now());
  return {
    requestCount: g.requestCount,
    retryCount: g.retryCount,
    throttleCount: g.throttleCount,
    active: g.active,
    windowSize: g.windowStarts.length,
  };
}

export function logGoogleHealthGateSummary(userId: string, context: string): void {
  const s = getGoogleHealthGateStats(userId);
  console.info(
    `${GOOGLE_HEALTH_LOG_PREFIX} summary context=${context} user=${userId} ` +
      `requests=${s.requestCount} retries=${s.retryCount} throttles=${s.throttleCount} ` +
      `active=${s.active} window=${s.windowSize}`,
  );
}
