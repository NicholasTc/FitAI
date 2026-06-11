/**
 * Readiness score engine — rule-based, subjective-first.
 *
 * Score breakdown (100 pts total):
 *   Subjective (40 pts):
 *     Energy level       10 pts
 *     Sleep quality      10 pts  (subjective feel, even if wearable has sleep too)
 *     Stress level       10 pts  (inverted — lower stress = more pts)
 *     Motivation         10 pts
 *
 *   Objective (40 pts):
 *     Sleep duration     15 pts  (vs baseline or absolute thresholds)
 *     HRV vs baseline    15 pts  (best recovery signal)
 *     Resting HR         10 pts  (lower = better; vs baseline)
 *
 *   Activity context (20 pts):
 *     Steps              10 pts  (activity level vs baseline)
 *     Sleep efficiency   10 pts  (quality indicator)
 *
 * When baseline is "forming" (<5 days), objective signals use absolute
 * thresholds rather than deltas so we don't penalise new Fitbit users.
 *
 * Day type:
 *   Push     75–100
 *   Maintain 50–74
 *   Recover  0–49
 */

import type {
  CheckInData,
  DayType,
  ReadinessReason,
  ReadinessResult,
} from "@/types/today";
import type { WeeklyBaseline } from "@/types/snapshot";
import type { DailySnapshot } from "@/types/snapshot";

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function scoreSlider(value: number, max = 10, weight = 10): number {
  return (value / max) * weight;
}

// ─── Subjective scoring (requires check-in) ───────────────────────────────────

function scoreSubjective(
  checkIn: CheckInData,
): { score: number; reasons: ReadinessReason[] } {
  const reasons: ReadinessReason[] = [];
  let score = 0;

  // Energy (1–10 → 0–10 pts)
  const energyPts = scoreSlider(checkIn.energyLevel, 10, 10);
  score += energyPts;
  if (checkIn.energyLevel >= 7) {
    reasons.push({
      icon: "energy",
      title: "Energy is high.",
      detail: `You rated energy ${checkIn.energyLevel}/10 — ready to perform.`,
      sentiment: "positive",
    });
  } else if (checkIn.energyLevel <= 4) {
    reasons.push({
      icon: "energy",
      title: "Energy is low.",
      detail: `You rated energy ${checkIn.energyLevel}/10 — conserve capacity today.`,
      sentiment: "negative",
    });
  }

  // Sleep quality (1–10 → 0–10 pts)
  const sleepQPts = scoreSlider(checkIn.sleepQuality, 10, 10);
  score += sleepQPts;
  if (checkIn.sleepQuality >= 7) {
    reasons.push({
      icon: "sleep",
      title: "Sleep felt restorative.",
      detail: `You rated sleep quality ${checkIn.sleepQuality}/10.`,
      sentiment: "positive",
    });
  } else if (checkIn.sleepQuality <= 4) {
    reasons.push({
      icon: "sleep",
      title: "Sleep felt poor.",
      detail: `You rated sleep quality ${checkIn.sleepQuality}/10 — recovery may be incomplete.`,
      sentiment: "negative",
    });
  }

  // Stress (inverted: 1 = no stress = 10 pts, 10 = max stress = 0 pts)
  const stressPts = scoreSlider(10 - checkIn.stressLevel + 1, 10, 10);
  score += clamp(stressPts, 0, 10);
  if (checkIn.stressLevel >= 7) {
    reasons.push({
      icon: "stress",
      title: "Stress is elevated.",
      detail: `You rated stress ${checkIn.stressLevel}/10 — this caps available capacity.`,
      sentiment: "caution",
    });
  } else if (checkIn.stressLevel <= 3) {
    reasons.push({
      icon: "stress-low",
      title: "Stress is low.",
      detail: `You rated stress ${checkIn.stressLevel}/10 — good mental headroom.`,
      sentiment: "positive",
    });
  }

  // Motivation (1–10 → 0–10 pts)
  const motivationPts = scoreSlider(checkIn.motivation, 10, 10);
  score += motivationPts;
  if (checkIn.motivation >= 7) {
    reasons.push({
      icon: "motivation",
      title: "Motivation is strong.",
      detail: `You rated motivation ${checkIn.motivation}/10.`,
      sentiment: "positive",
    });
  } else if (checkIn.motivation <= 4) {
    reasons.push({
      icon: "motivation",
      title: "Motivation is low.",
      detail: `You rated motivation ${checkIn.motivation}/10 — keep expectations realistic.`,
      sentiment: "caution",
    });
  }

  return { score: clamp(score, 0, 40), reasons };
}

// ─── Objective scoring (wearable data) ────────────────────────────────────────

function scoreObjective(
  snapshot: DailySnapshot,
  baseline: WeeklyBaseline,
): { score: number; reasons: ReadinessReason[] } {
  const reasons: ReadinessReason[] = [];
  let score = 0;
  const isForming = baseline.status === "forming";

  // Sleep duration (0–15 pts)
  if (snapshot.sleepMinutes !== null) {
    const avgSleep = baseline.sleepMinutes;
    let sleepPts: number;
    let sleepLabel: string;

    if (avgSleep !== null && !isForming) {
      // Compare to baseline
      const ratio = snapshot.sleepMinutes / avgSleep;
      sleepPts = clamp(ratio * 10, 0, 15);
      const h = Math.floor(snapshot.sleepMinutes / 60);
      const m = snapshot.sleepMinutes % 60;
      const avgH = Math.floor(avgSleep / 60);
      const avgM = Math.round(avgSleep % 60);
      sleepLabel = `${h}h ${m}m — avg ${avgH}h ${avgM}m`;

      if (ratio >= 1.1) {
        reasons.push({
          icon: "sleep",
          title: "Sleep was above average.",
          detail: `${sleepLabel}. Extra rest boosts readiness.`,
          sentiment: "positive",
        });
      } else if (ratio < 0.85) {
        reasons.push({
          icon: "sleep",
          title: "Sleep was below average.",
          detail: `${sleepLabel}. Reduced sleep limits recovery.`,
          sentiment: "negative",
        });
      }
    } else {
      // Absolute thresholds (baseline forming)
      if (snapshot.sleepMinutes >= 420) sleepPts = 15;       // 7h+
      else if (snapshot.sleepMinutes >= 360) sleepPts = 11;  // 6h+
      else if (snapshot.sleepMinutes >= 300) sleepPts = 7;   // 5h+
      else sleepPts = 3;
      const h = Math.floor(snapshot.sleepMinutes / 60);
      const m = snapshot.sleepMinutes % 60;
      sleepLabel = `${h}h ${m}m`;
      if (snapshot.sleepMinutes >= 420) {
        reasons.push({
          icon: "sleep",
          title: "Good sleep duration.",
          detail: `${sleepLabel} — solid recovery foundation.`,
          sentiment: "positive",
        });
      } else if (snapshot.sleepMinutes < 360) {
        reasons.push({
          icon: "sleep",
          title: "Sleep was short.",
          detail: `${sleepLabel} — aim for 7h+ for full recovery.`,
          sentiment: "caution",
        });
      }
    }
    score += sleepPts;
  } else {
    // No sleep data — give neutral score
    score += 8;
  }

  // HRV vs baseline (0–15 pts)
  if (snapshot.hrv !== null) {
    const avgHrv = baseline.hrv;
    let hrvPts: number;

    if (avgHrv !== null && !isForming) {
      const ratio = snapshot.hrv / avgHrv;
      hrvPts = clamp(ratio * 11, 0, 15);
      if (ratio >= 1.1) {
        reasons.push({
          icon: "hrv",
          title: "HRV is above baseline.",
          detail: `${snapshot.hrv.toFixed(1)}ms vs avg ${avgHrv.toFixed(1)}ms — nervous system well recovered.`,
          sentiment: "positive",
        });
      } else if (ratio < 0.9) {
        reasons.push({
          icon: "hrv",
          title: "HRV is below baseline.",
          detail: `${snapshot.hrv.toFixed(1)}ms vs avg ${avgHrv.toFixed(1)}ms — body is still recovering.`,
          sentiment: "caution",
        });
      }
    } else {
      // Absolute: HRV >80ms = good for most people
      if (snapshot.hrv >= 80) hrvPts = 13;
      else if (snapshot.hrv >= 50) hrvPts = 9;
      else hrvPts = 5;
    }
    score += hrvPts;
  } else {
    score += 8; // neutral when not available
  }

  // Resting HR (0–10 pts, lower = better)
  if (snapshot.restingHr !== null) {
    const avgRhr = baseline.restingHr;
    let rhrPts: number;

    if (avgRhr !== null && !isForming) {
      // Lower than avg = good, higher than avg = worse
      const ratio = avgRhr / snapshot.restingHr; // inverted
      rhrPts = clamp(ratio * 8, 0, 10);
      if (snapshot.restingHr < avgRhr - 3) {
        reasons.push({
          icon: "heart",
          title: "Resting HR is lower than usual.",
          detail: `${Math.round(snapshot.restingHr)}bpm vs avg ${Math.round(avgRhr)}bpm — good cardiovascular recovery.`,
          sentiment: "positive",
        });
      } else if (snapshot.restingHr > avgRhr + 5) {
        reasons.push({
          icon: "heart",
          title: "Resting HR is elevated.",
          detail: `${Math.round(snapshot.restingHr)}bpm vs avg ${Math.round(avgRhr)}bpm — may indicate incomplete recovery.`,
          sentiment: "caution",
        });
      }
    } else {
      if (snapshot.restingHr <= 55) rhrPts = 10;
      else if (snapshot.restingHr <= 65) rhrPts = 8;
      else if (snapshot.restingHr <= 75) rhrPts = 6;
      else rhrPts = 4;
    }
    score += rhrPts;
  } else {
    score += 5;
  }

  return { score: clamp(score, 0, 40), reasons };
}

// ─── Activity context (0–20 pts) ─────────────────────────────────────────────

function scoreActivity(
  snapshot: DailySnapshot,
  baseline: WeeklyBaseline,
): number {
  let score = 0;

  // Steps vs baseline (0–10 pts)
  if (snapshot.steps !== null && baseline.steps !== null && baseline.steps > 0) {
    const ratio = snapshot.steps / baseline.steps;
    score += clamp(ratio * 7, 0, 10);
  } else {
    score += 5;
  }

  // Sleep efficiency (0–10 pts)
  if (snapshot.sleepEfficiency !== null) {
    score += clamp((snapshot.sleepEfficiency / 100) * 10, 0, 10);
  } else {
    score += 5;
  }

  return clamp(score, 0, 20);
}

// ─── Day type ─────────────────────────────────────────────────────────────────

function toDayType(score: number): DayType {
  if (score >= 75) return "push";
  if (score >= 50) return "maintain";
  return "recover";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeReadiness(
  snapshot: DailySnapshot,
  baseline: WeeklyBaseline,
  checkIn: CheckInData | null,
): ReadinessResult {
  const objectiveResult = scoreObjective(snapshot, baseline);
  const activityScore = scoreActivity(snapshot, baseline);

  if (!checkIn) {
    // No check-in yet — score from objective only, scaled to 100
    // Objective (40) + Activity (20) = 60 max → scale to 100
    const rawScore = objectiveResult.score + activityScore;
    const scaled = Math.round((rawScore / 60) * 100);
    const score = clamp(scaled, 0, 100);

    return {
      score,
      dayType: toDayType(score),
      reasons: objectiveResult.reasons,
      subjectiveScore: 0,
      objectiveScore: objectiveResult.score,
      hasCheckIn: false,
    };
  }

  const subjectiveResult = scoreSubjective(checkIn);
  const rawScore =
    subjectiveResult.score + objectiveResult.score + activityScore;
  const score = clamp(Math.round(rawScore), 0, 100);

  // Merge reasons: subjective first, then objective
  const reasons = [
    ...subjectiveResult.reasons,
    ...objectiveResult.reasons,
  ].slice(0, 4); // cap at 4 for UI

  return {
    score,
    dayType: toDayType(score),
    reasons,
    subjectiveScore: subjectiveResult.score,
    objectiveScore: objectiveResult.score,
    hasCheckIn: true,
  };
}

export function dayTypeLabel(dt: DayType): string {
  return dt === "push" ? "Push Day" : dt === "maintain" ? "Maintain Day" : "Recover Day";
}

export function dayTypeColor(dt: DayType): {
  text: string;
  bg: string;
  border: string;
  dot: string;
} {
  switch (dt) {
    case "push":
      return {
        text: "#e05f3c",
        bg: "#fff3f0",
        border: "rgba(224,95,60,0.22)",
        dot: "#e05f3c",
      };
    case "maintain":
      return {
        text: "#009e83",
        bg: "#ecfaf6",
        border: "rgba(0,158,131,0.22)",
        dot: "#009e83",
      };
    case "recover":
      return {
        text: "#7850e2",
        bg: "#f4f0ff",
        border: "rgba(120,80,226,0.22)",
        dot: "#7850e2",
      };
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
    case "push":    return { start: "#ff9a6c", end: "#e05f3c" };
    case "maintain": return { start: "#00c9a7", end: "#4a7df6" };
    case "recover":  return { start: "#c084fc", end: "#7850e2" };
  }
}
