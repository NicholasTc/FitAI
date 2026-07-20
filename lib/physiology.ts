/**
 * Shared physiology helpers — z-score gates used by readiness, stimulus reserve,
 * and recovery-state engines. Keep thresholds in one place so scoring stays consistent.
 */

/** Minimum sample count before z-scoring activates for a metric. */
export const Z_SCORE_MIN_DAYS = 14;

/** Minimum SD values to ensure variability is real (not measurement noise). */
export const MIN_SD_HRV = 3.0; // ms
export const MIN_SD_RHR = 0.8; // bpm
export const MIN_SD_SLEEP = 15; // min

export function canUseZScore(n: number, sd: number | null, minSd: number): boolean {
  return n >= Z_SCORE_MIN_DAYS && sd !== null && sd >= minSd;
}

/**
 * Maps z-score to 0–maxPts. Higher z → more pts.
 * z = +2 → maxPts, z = 0 → 50%, z = −2 → 0.
 */
export function zToScore(z: number, maxPts: number): number {
  const clamped = Math.max(0, Math.min(maxPts, Math.round(((z + 2) / 4) * maxPts)));
  return clamped;
}

/** Inverted: lower z → more pts. Used for RHR (lower is better). */
export function zToScoreInverted(z: number, maxPts: number): number {
  return zToScore(-z, maxPts);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
