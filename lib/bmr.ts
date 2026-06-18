/**
 * BMR and calorie context utilities — Phase A.
 *
 * Mifflin-St Jeor equation (1990) — most validated BMR formula (±10% accuracy):
 *   Male:   BMR = 10×weight(kg) + 6.25×height(cm) − 5×age + 5
 *   Female: BMR = 10×weight(kg) + 6.25×height(cm) − 5×age − 161
 *
 * Physical Activity Level (PAL) multipliers — FAO/WHO/UNU 2004:
 *   < 0.8× BMR  = Very low (below resting — unusual, flag it)
 *   0.8–1.2×    = Sedentary / rest day
 *   1.2–1.6×    = Light activity
 *   1.6–2.0×    = Moderate activity
 *   > 2.0×      = High output / heavy training day
 */

export interface UserProfile {
  age:      number | null;
  sex:      "male" | "female" | null;
  heightCm: number | null;
  weightKg: number | null;
}

export interface CalorieContext {
  bmr:               number;
  activityMultiplier: number;   // totalCalories / bmr
  label:             string;
  isLow:             boolean;   // < 0.8× BMR — flag for AI
  isSurplus:         boolean;   // > 2.0× BMR — high output
}

/**
 * Compute Basal Metabolic Rate using Mifflin-St Jeor (1990).
 * Returns null if any required field is missing.
 */
export function computeBMR(profile: UserProfile): number | null {
  const { age, sex, heightCm, weightKg } = profile;
  if (age === null || sex === null || heightCm === null || weightKg === null) return null;

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

/**
 * Contextualise today's total calorie burn relative to BMR.
 * Returns null when BMR can't be computed or calories not yet available.
 */
export function computeCalorieContext(
  totalCalories: number | null,
  profile: UserProfile,
): CalorieContext | null {
  if (totalCalories === null) return null;
  const bmr = computeBMR(profile);
  if (bmr === null || bmr <= 0) return null;

  const ratio = totalCalories / bmr;

  let label: string;
  if      (ratio < 0.8)  label = "Below resting baseline";
  else if (ratio < 1.2)  label = "Rest day range";
  else if (ratio < 1.6)  label = "Light activity";
  else if (ratio < 2.0)  label = "Moderate activity";
  else                   label = "High output day";

  return {
    bmr:                Math.round(bmr),
    activityMultiplier: Math.round(ratio * 100) / 100,
    label,
    isLow:     ratio < 0.8,
    isSurplus: ratio >= 2.0,
  };
}

/**
 * Age/sex-adjusted absolute HRV thresholds for use when personal baseline
 * is still forming (< 14 valid days).
 *
 * Based on Nunan et al. 2010 (population RMSSD norms):
 * "A Quantitative Systematic Review of Normal Values for Short-Term
 * Heart Rate Variability in Healthy Adults" — European Journal of Preventive Cardiology.
 *
 * Returns { good, ok } thresholds in ms.
 * Values below 'ok' are flagged as low for the user's demographic.
 */
export function getHrvAbsoluteThresholds(
  profile: UserProfile,
): { good: number; ok: number } {
  const { age, sex } = profile;

  // Default (no profile) — conservative generic thresholds
  if (age === null || sex === null) return { good: 50, ok: 35 };

  if (sex === "male") {
    if (age <= 35) return { good: 50, ok: 35 };
    if (age <= 50) return { good: 42, ok: 28 };
    return { good: 35, ok: 22 };
  } else {
    if (age <= 35) return { good: 55, ok: 38 };
    if (age <= 50) return { good: 46, ok: 30 };
    return { good: 38, ok: 25 };
  }
}
