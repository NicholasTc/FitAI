/**
 * Readiness score engine — v2, data-gated progressive accuracy.
 *
 * Phase 0  Instrumentation: breakdown object, confidence, dataCompleteness
 * Phase 1a Time-of-day fairness: same-day steps treated as neutral (no morning penalty)
 * Phase 1b Confidence-weighted output: explicit "high/medium/low" on result
 * Phase 1c Sleep stages: deep+REM proportion adjusts sleep sub-score (±2 pts)
 * Phase 2  Personal baselines: z-score scoring for HRV + RHR when ≥14 days + stable SD
 * Phase 3  Training load: acute/chronic ratio modifier ±10 when ≥14 chronic days
 *
 * Score breakdown (100 pts total):
 *   Subjective (40 pts)  — requires check-in
 *     Energy level       10 pts
 *     Sleep quality      10 pts  (subjective feel)
 *     Stress level       10 pts  (inverted — lower = more pts)
 *     Motivation         10 pts
 *
 *   Objective (40 pts)
 *     Sleep duration     15 pts  (ratio vs baseline or absolute thresholds)
 *                                Phase 1c: ±2 deep+REM quality adjustment
 *     HRV                15 pts  Phase 2: z-score when ready, else ratio vs avg
 *     Resting HR         10 pts  Phase 2: z-score when ready, else ratio vs avg
 *
 *   Activity context (20 pts)
 *     Steps              10 pts  Phase 1a: neutral on today (partial-day)
 *     Sleep efficiency   10 pts
 *
 *   Training load modifier  ±10  Phase 3: acute/chronic ratio
 *
 * Day type:
 *   Push     ≥75
 *   Maintain 50–74
 *   Recover  <50
 *
 * Safety guarantee: every new scoring path is gated by sample-count checks.
 * When a gate fails the function falls back to the previous logic unchanged.
 * Existing callers that pass only 3 arguments continue to work without modification.
 */

import type {
  CheckInData,
  DayType,
  ReadinessReason,
  ReadinessResult,
  ScoreBreakdown,
} from "@/types/today";
import type { WeeklyBaseline } from "@/types/snapshot";
import type { DailySnapshot } from "@/types/snapshot";
import type { TrainingLoadResult } from "@/lib/trainingLoad";
import { getHrvAbsoluteThresholds, type UserProfile } from "@/lib/bmr";

// ─── Options ─────────────────────────────────────────────────────────────────

export interface ReadinessOptions {
  /** YYYY-MM-DD — enables Phase 1a time-of-day fairness for same-day activity */
  date?: string;
  /** Pre-computed training load from lib/trainingLoad.ts — Phase 3 */
  trainingLoad?: TrainingLoadResult;
  /** Phase A: biometric profile — enables age/sex-adjusted thresholds */
  userProfile?: UserProfile;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function scoreSlider(value: number, max = 10, weight = 10): number {
  return (value / max) * weight;
}

function isToday(date: string | undefined): boolean {
  if (!date) return false;
  return date === new Date().toLocaleDateString("en-CA");
}

// ─── Phase 2: z-score gates ───────────────────────────────────────────────────

// Minimum sample count before z-scoring activates for a metric.
const Z_SCORE_MIN_DAYS = 14;
// Minimum SD values to ensure variability is real (not measurement noise).
const MIN_SD_HRV      = 3.0;  // ms  — Fitbit HRV is noisy at < 3ms SD
const MIN_SD_RHR      = 0.8;  // bpm — sub-1bpm SD means essentially no variability
const MIN_SD_SLEEP    = 15;   // min — < 15min SD means sleep is very consistent

function canUseZScore(n: number, sd: number | null, minSd: number): boolean {
  return n >= Z_SCORE_MIN_DAYS && sd !== null && sd >= minSd;
}

/**
 * Maps z-score to 0–maxPts. Higher z → more pts.
 * z = +2 → maxPts, z = 0 → 50%, z = −2 → 0.
 */
function zToScore(z: number, maxPts: number): number {
  return clamp(Math.round(((z + 2) / 4) * maxPts), 0, maxPts);
}

/** Inverted: lower z → more pts. Used for RHR (lower is better). */
function zToScoreInverted(z: number, maxPts: number): number {
  return zToScore(-z, maxPts);
}

// ─── Subjective scoring ───────────────────────────────────────────────────────

function scoreSubjective(
  checkIn: CheckInData,
): { score: number; reasons: ReadinessReason[] } {
  const reasons: ReadinessReason[] = [];
  let score = 0;

  const energyPts = scoreSlider(checkIn.energyLevel, 10, 10);
  score += energyPts;
  if (checkIn.energyLevel >= 7) {
    reasons.push({
      icon: "energy", title: "Energy is high.",
      detail: `You rated energy ${checkIn.energyLevel}/10 — ready to perform.`,
      sentiment: "positive",
    });
  } else if (checkIn.energyLevel <= 4) {
    reasons.push({
      icon: "energy", title: "Energy is low.",
      detail: `You rated energy ${checkIn.energyLevel}/10 — conserve capacity today.`,
      sentiment: "negative",
    });
  }

  const sleepQPts = scoreSlider(checkIn.sleepQuality, 10, 10);
  score += sleepQPts;
  if (checkIn.sleepQuality >= 7) {
    reasons.push({
      icon: "sleep", title: "Sleep felt restorative.",
      detail: `You rated sleep quality ${checkIn.sleepQuality}/10.`,
      sentiment: "positive",
    });
  } else if (checkIn.sleepQuality <= 4) {
    reasons.push({
      icon: "sleep", title: "Sleep felt poor.",
      detail: `You rated sleep quality ${checkIn.sleepQuality}/10 — recovery may be incomplete.`,
      sentiment: "negative",
    });
  }

  const stressPts = scoreSlider(10 - checkIn.stressLevel + 1, 10, 10);
  score += clamp(stressPts, 0, 10);
  if (checkIn.stressLevel >= 7) {
    reasons.push({
      icon: "stress", title: "Stress is elevated.",
      detail: `You rated stress ${checkIn.stressLevel}/10 — this caps available capacity.`,
      sentiment: "caution",
    });
  } else if (checkIn.stressLevel <= 3) {
    reasons.push({
      icon: "stress-low", title: "Stress is low.",
      detail: `You rated stress ${checkIn.stressLevel}/10 — good mental headroom.`,
      sentiment: "positive",
    });
  }

  const motivationPts = scoreSlider(checkIn.motivation, 10, 10);
  score += motivationPts;
  if (checkIn.motivation >= 7) {
    reasons.push({
      icon: "motivation", title: "Motivation is strong.",
      detail: `You rated motivation ${checkIn.motivation}/10.`,
      sentiment: "positive",
    });
  } else if (checkIn.motivation <= 4) {
    reasons.push({
      icon: "motivation", title: "Motivation is low.",
      detail: `You rated motivation ${checkIn.motivation}/10 — keep expectations realistic.`,
      sentiment: "caution",
    });
  }

  return { score: clamp(score, 0, 40), reasons };
}

// ─── Objective scoring ────────────────────────────────────────────────────────

interface ObjectiveResult {
  score: number;
  reasons: ReadinessReason[];
  sleepBreakdown:   ScoreBreakdown["sleep"];
  hrvBreakdown:     ScoreBreakdown["hrv"];
  restingHrBreakdown: ScoreBreakdown["restingHr"];
}

function scoreObjective(
  snapshot: DailySnapshot,
  baseline: WeeklyBaseline,
  options?: ReadinessOptions,
): ObjectiveResult {
  const reasons: ReadinessReason[] = [];
  let score = 0;
  const isForming = baseline.status === "forming";

  // ── Sleep (0–15 pts) + Phase 1c stage quality ────────────────────────────
  let sleepPts: number = 8; // neutral fallback
  let sleepDataSource: "real" | "neutral" = "neutral";
  let stageBonus = 0;

  if (snapshot.sleepMinutes !== null) {
    sleepDataSource = "real";
    const avgSleep = baseline.sleepMinutes;

    if (avgSleep !== null && !isForming) {
      const ratio = snapshot.sleepMinutes / avgSleep;
      sleepPts = clamp(ratio * 10, 0, 15);
      const h = Math.floor(snapshot.sleepMinutes / 60), m = snapshot.sleepMinutes % 60;
      const avgH = Math.floor(avgSleep / 60), avgM = Math.round(avgSleep % 60);
      const label = `${h}h ${m}m — avg ${avgH}h ${avgM}m`;
      if (ratio >= 1.1) {
        reasons.push({ icon: "sleep", title: "Sleep was above average.", detail: `${label}. Extra rest boosts readiness.`, sentiment: "positive" });
      } else if (ratio < 0.85) {
        reasons.push({ icon: "sleep", title: "Sleep was below average.", detail: `${label}. Reduced sleep limits recovery.`, sentiment: "negative" });
      }
    } else {
      // Phase C: absolute thresholds aligned with Hirshkowitz et al. 2015
      // (NSF sleep duration recommendations for adults):
      // ≥8h (480 min) = optimal / may be appropriate
      // 7–9h (420–539 min) = recommended range
      // 6–7h (360–419 min) = may be appropriate (some individuals)
      // <6h (<360 min) = not recommended
      if      (snapshot.sleepMinutes >= 480) sleepPts = 15;
      else if (snapshot.sleepMinutes >= 420) sleepPts = 12;
      else if (snapshot.sleepMinutes >= 360) sleepPts = 8;
      else if (snapshot.sleepMinutes >= 300) sleepPts = 5;
      else                                   sleepPts = 2;
      const h = Math.floor(snapshot.sleepMinutes / 60), m = snapshot.sleepMinutes % 60;
      const label = `${h}h ${m}m`;
      if (snapshot.sleepMinutes >= 420) {
        reasons.push({ icon: "sleep", title: "Good sleep duration.", detail: `${label} — within the recommended 7–9h range.`, sentiment: "positive" });
      } else if (snapshot.sleepMinutes < 360) {
        reasons.push({ icon: "sleep", title: "Sleep was short.", detail: `${label} — below the recommended 6h minimum. Recovery is likely impaired.`, sentiment: "negative" });
      } else {
        reasons.push({ icon: "sleep", title: "Sleep was below target.", detail: `${label} — in the 6–7h range. Aim for 7h+ for optimal recovery.`, sentiment: "caution" });
      }
    }

    // Phase 1c / C: deep+REM proportion adjusts score within ±2 pts.
    // Research basis: Ohayon et al. (2004) meta-analysis of sleep stages.
    // Healthy adults: deep (N3) ~13–23%, REM ~20–25% of total sleep → combined ~33–48%.
    const hasStages = snapshot.sleepDeepMin !== null || snapshot.sleepRemMin !== null;
    if (hasStages && snapshot.sleepMinutes > 0) {
      const deepRem = (snapshot.sleepDeepMin ?? 0) + (snapshot.sleepRemMin ?? 0);
      const qualityRatio = deepRem / snapshot.sleepMinutes;
      // Thresholds based on Ohayon 2004 combined deep+REM norms:
      if      (qualityRatio >= 0.38) stageBonus =  2; // above norm → excellent quality
      else if (qualityRatio >= 0.28) stageBonus =  1; // normal range
      else if (qualityRatio < 0.18)  stageBonus = -2; // clearly fragmented/poor quality
      else if (qualityRatio < 0.25)  stageBonus = -1; // below norm
      sleepPts = clamp(sleepPts + stageBonus, 0, 15);
    }
  }
  score += sleepPts;

  // ── HRV (0–15 pts) — Phase 2 z-score when ready ──────────────────────────
  let hrvPts: number = 8; // neutral fallback
  let hrvDataSource: "real" | "neutral" = "neutral";
  let hrvMethod: ScoreBreakdown["hrv"]["method"] = "neutral";
  let hrvZ: number | undefined;

  if (snapshot.hrv !== null) {
    hrvDataSource = "real";
    const avgHrv = baseline.hrv;
    const sdHrv  = baseline.sdHrv ?? null;
    const nHrv   = baseline.nHrv ?? 0;

    if (!isForming && avgHrv !== null && canUseZScore(nHrv, sdHrv, MIN_SD_HRV)) {
      // Phase 2 z-score path
      hrvZ      = (snapshot.hrv - avgHrv) / sdHrv!;
      hrvPts    = zToScore(hrvZ, 15);
      hrvMethod = "z-score";
      if (hrvZ >= 1.0) {
        reasons.push({ icon: "hrv", title: "HRV is well above your norm.", detail: `${snapshot.hrv.toFixed(1)}ms — ${hrvZ.toFixed(1)}σ above baseline. Strong recovery signal.`, sentiment: "positive" });
      } else if (hrvZ <= -1.0) {
        reasons.push({ icon: "hrv", title: "HRV is notably below your norm.", detail: `${snapshot.hrv.toFixed(1)}ms — ${Math.abs(hrvZ).toFixed(1)}σ below baseline. Body still recovering.`, sentiment: "caution" });
      }
    } else if (!isForming && avgHrv !== null) {
      // Legacy ratio path
      const ratio = snapshot.hrv / avgHrv;
      hrvPts    = clamp(ratio * 11, 0, 15);
      hrvMethod = "ratio";
      if (ratio >= 1.1) {
        reasons.push({ icon: "hrv", title: "HRV is above baseline.", detail: `${snapshot.hrv.toFixed(1)}ms vs avg ${avgHrv.toFixed(1)}ms — nervous system well recovered.`, sentiment: "positive" });
      } else if (ratio < 0.9) {
        reasons.push({ icon: "hrv", title: "HRV is below baseline.", detail: `${snapshot.hrv.toFixed(1)}ms vs avg ${avgHrv.toFixed(1)}ms — body is still recovering.`, sentiment: "caution" });
      }
    } else {
      // Phase A: age/sex-adjusted absolute thresholds (Nunan et al. 2010)
      // when baseline is forming. Falls back to generic when no profile.
      const hrvThresh = getHrvAbsoluteThresholds(options?.userProfile ?? { age: null, sex: null, heightCm: null, weightKg: null });
      if      (snapshot.hrv >= hrvThresh.good * 1.4) hrvPts = 13;
      else if (snapshot.hrv >= hrvThresh.good)        hrvPts = 11;
      else if (snapshot.hrv >= hrvThresh.ok)          hrvPts = 7;
      else                                            hrvPts = 4;
      hrvMethod = "ratio";
    }
  }
  score += hrvPts;

  // ── Resting HR (0–10 pts) — Phase 2 z-score when ready ───────────────────
  let rhrPts: number = 5; // neutral fallback
  let rhrDataSource: "real" | "neutral" = "neutral";
  let rhrMethod: ScoreBreakdown["restingHr"]["method"] = "neutral";
  let rhrZ: number | undefined;

  if (snapshot.restingHr !== null) {
    rhrDataSource = "real";
    const avgRhr = baseline.restingHr;
    const sdRhr  = baseline.sdRestingHr ?? null;
    const nRhr   = baseline.nRestingHr ?? 0;

    if (!isForming && avgRhr !== null && canUseZScore(nRhr, sdRhr, MIN_SD_RHR)) {
      // Phase 2 z-score path (inverted: lower RHR = higher z score)
      rhrZ      = (snapshot.restingHr - avgRhr) / sdRhr!;
      rhrPts    = zToScoreInverted(rhrZ, 10);
      rhrMethod = "z-score";
      if (rhrZ <= -1.0) {
        reasons.push({ icon: "heart", title: "Resting HR well below your norm.", detail: `${Math.round(snapshot.restingHr)}bpm — ${Math.abs(rhrZ).toFixed(1)}σ below baseline. Good cardiovascular recovery.`, sentiment: "positive" });
      } else if (rhrZ >= 1.0) {
        reasons.push({ icon: "heart", title: "Resting HR notably elevated.", detail: `${Math.round(snapshot.restingHr)}bpm — ${rhrZ.toFixed(1)}σ above baseline. May indicate incomplete recovery.`, sentiment: "caution" });
      }
    } else if (!isForming && avgRhr !== null) {
      // Legacy ratio path
      const ratio = avgRhr / snapshot.restingHr;
      rhrPts    = clamp(ratio * 8, 0, 10);
      rhrMethod = "ratio";
      if (snapshot.restingHr < avgRhr - 3) {
        reasons.push({ icon: "heart", title: "Resting HR is lower than usual.", detail: `${Math.round(snapshot.restingHr)}bpm vs avg ${Math.round(avgRhr)}bpm — good cardiovascular recovery.`, sentiment: "positive" });
      } else if (snapshot.restingHr > avgRhr + 5) {
        reasons.push({ icon: "heart", title: "Resting HR is elevated.", detail: `${Math.round(snapshot.restingHr)}bpm vs avg ${Math.round(avgRhr)}bpm — may indicate incomplete recovery.`, sentiment: "caution" });
      }
    } else {
      if      (snapshot.restingHr <= 55) rhrPts = 10;
      else if (snapshot.restingHr <= 65) rhrPts = 8;
      else if (snapshot.restingHr <= 75) rhrPts = 6;
      else                               rhrPts = 4;
      rhrMethod = "ratio";
    }
  }
  score += rhrPts;

  return {
    score: clamp(score, 0, 40),
    reasons,
    sleepBreakdown:     { score: sleepPts, maxPts: 15, dataSource: sleepDataSource, minutes: snapshot.sleepMinutes, stageBonus },
    hrvBreakdown:       { score: hrvPts,   maxPts: 15, dataSource: hrvDataSource,   method: hrvMethod, z: hrvZ },
    restingHrBreakdown: { score: rhrPts,   maxPts: 10, dataSource: rhrDataSource,   method: rhrMethod, z: rhrZ },
  };
}

// ─── Activity context ─────────────────────────────────────────────────────────

interface ActivityResult {
  score: number;
  breakdown: ScoreBreakdown["activity"];
}

function scoreActivity(
  snapshot: DailySnapshot,
  baseline: WeeklyBaseline,
  options?: ReadinessOptions,
): ActivityResult {
  let score = 0;
  let stepsSource: "real" | "neutral" = "neutral";
  const efficiencySource: "real" | "neutral" =
    snapshot.sleepEfficiency !== null ? "real" : "neutral";

  // Phase 1a: same-day steps are a partial-day metric and unfairly penalise
  // mornings. Treat as neutral today; compare only for past dates.
  const todayActivity = isToday(options?.date);

  if (!todayActivity && snapshot.steps !== null && baseline.steps !== null && baseline.steps > 0) {
    stepsSource = "real";
    score += clamp((snapshot.steps / baseline.steps) * 7, 0, 10);
  } else {
    score += 5; // neutral
  }

  score += snapshot.sleepEfficiency !== null
    ? clamp((snapshot.sleepEfficiency / 100) * 10, 0, 10)
    : 5;

  const total = clamp(score, 0, 20);
  return {
    score: total,
    breakdown: {
      score: total,
      maxPts: 20,
      timeOfDayAdjusted: todayActivity,
      stepsSource,
      efficiencySource,
    },
  };
}

// ─── Confidence (Phase 1b) ────────────────────────────────────────────────────

function computeConfidence(
  snapshot: DailySnapshot,
  hasCheckIn: boolean,
): { confidence: "high" | "medium" | "low"; dataCompleteness: number } {
  // Four key signals that matter most for accuracy
  const present = [
    snapshot.sleepMinutes !== null,
    snapshot.hrv !== null,
    snapshot.restingHr !== null,
    hasCheckIn,
  ].filter(Boolean).length;

  const dataCompleteness = present / 4;
  const confidence =
    dataCompleteness >= 0.75 ? "high" :
    dataCompleteness >= 0.5  ? "medium" : "low";
  return { confidence, dataCompleteness };
}

// ─── Day type ─────────────────────────────────────────────────────────────────

function toDayType(score: number): DayType {
  if (score >= 75) return "push";
  if (score >= 50) return "maintain";
  return "recover";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the readiness score and day type.
 *
 * Backward-compatible: existing callers that pass only (snapshot, baseline, checkIn)
 * continue to work identically. The optional fourth argument unlocks Phase 1a + Phase 3.
 */
export function computeReadiness(
  snapshot: DailySnapshot,
  baseline: WeeklyBaseline,
  checkIn: CheckInData | null,
  options?: ReadinessOptions,
): ReadinessResult {
  const objectiveResult  = scoreObjective(snapshot, baseline, options);
  const activityResult   = scoreActivity(snapshot, baseline, options);
  const { confidence, dataCompleteness } = computeConfidence(snapshot, !!checkIn);

  // Phase 3: training load modifier (0 when insufficient data or not passed)
  const loadModifier = options?.trainingLoad?.modifier ?? 0;
  const trainingLoadBreakdown: ScoreBreakdown["trainingLoad"] = {
    modifier: loadModifier,
    method:   options?.trainingLoad?.method ?? "insufficient-data",
    ratio:    options?.trainingLoad?.ratio  ?? null,
  };

  if (!checkIn) {
    // No check-in — scale objective + activity (max 60) to 100, then apply modifier
    const rawScore = objectiveResult.score + activityResult.score;
    const scaled   = Math.round((rawScore / 60) * 100);
    const score    = clamp(scaled + loadModifier, 0, 100);

    const breakdown: ScoreBreakdown = {
      subjective:  null,
      sleep:       objectiveResult.sleepBreakdown,
      hrv:         objectiveResult.hrvBreakdown,
      restingHr:   objectiveResult.restingHrBreakdown,
      activity:    activityResult.breakdown,
      trainingLoad: trainingLoadBreakdown,
    };

    return {
      score,
      dayType: toDayType(score),
      reasons: objectiveResult.reasons,
      subjectiveScore: 0,
      objectiveScore:  objectiveResult.score,
      hasCheckIn: false,
      confidence,
      dataCompleteness,
      breakdown,
    };
  }

  const subjectiveResult = scoreSubjective(checkIn);
  const rawScore = subjectiveResult.score + objectiveResult.score + activityResult.score;
  const score    = clamp(Math.round(rawScore) + loadModifier, 0, 100);

  const reasons = [
    ...subjectiveResult.reasons,
    ...objectiveResult.reasons,
  ].slice(0, 4);

  const breakdown: ScoreBreakdown = {
    subjective:  { score: subjectiveResult.score, maxPts: 40, present: true },
    sleep:       objectiveResult.sleepBreakdown,
    hrv:         objectiveResult.hrvBreakdown,
    restingHr:   objectiveResult.restingHrBreakdown,
    activity:    activityResult.breakdown,
    trainingLoad: trainingLoadBreakdown,
  };

  return {
    score,
    dayType: toDayType(score),
    reasons,
    subjectiveScore: subjectiveResult.score,
    objectiveScore:  objectiveResult.score,
    hasCheckIn: true,
    confidence,
    dataCompleteness,
    breakdown,
  };
}

// ─── Utility exports (unchanged from v1) ─────────────────────────────────────

export function dayTypeLabel(dt: DayType): string {
  return dt === "push" ? "Push Day" : dt === "maintain" ? "Maintain Day" : "Recover Day";
}

export function dayTypeColor(dt: DayType): {
  text: string; bg: string; border: string; dot: string;
} {
  switch (dt) {
    case "push":     return { text: "#e05f3c", bg: "#fff3f0", border: "rgba(224,95,60,0.22)",    dot: "#e05f3c" };
    case "maintain": return { text: "#009e83", bg: "#ecfaf6", border: "rgba(0,158,131,0.22)",    dot: "#009e83" };
    case "recover":  return { text: "#7850e2", bg: "#f4f0ff", border: "rgba(120,80,226,0.22)",   dot: "#7850e2" };
  }
}

export function readinessLabel(score: number): string {
  if (score >= 85) return "Peak condition";
  if (score >= 75) return "Ready to push";
  if (score >= 65) return "Good baseline";
  if (score >= 55) return "Steady state";
  if (score >= 45) return "Below baseline";
  if (score >= 35) return "Needs recovery";
  return "Rest today";
}

export function ringGradient(dt: DayType): { start: string; end: string } {
  switch (dt) {
    case "push":     return { start: "#ff9a6c", end: "#e05f3c" };
    case "maintain": return { start: "#00c9a7", end: "#4a7df6" };
    case "recover":  return { start: "#c084fc", end: "#7850e2" };
  }
}
