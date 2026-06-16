/**
 * Rule-based guardrails for each day type.
 * No API call — computed instantly from readiness score + sleep baseline.
 *
 * Score bands (6 tiers):
 *   push-peak     90–100  All systems go — full intensity permitted
 *   push          75–89   Ready — hard sessions and focused work supported
 *   maintain-high 62–74   Solid — moderate-hard training, 2 deep blocks max
 *   maintain-low  50–61   Steady — constrained; protect cognitive & physical load
 *   recover       32–49   Below baseline — light movement, easy tasks only
 *   rest          0–31    Rest today — minimal load, recovery priority
 */

import type { DayType } from "@/types/today";

export type GuardrailLevel = "ok" | "moderate" | "avoid";

export type ScoreBand =
  | "push-peak"
  | "push"
  | "maintain-high"
  | "maintain-low"
  | "recover"
  | "rest";

export interface GuardrailRow {
  label: string;
  value: string;
  level: GuardrailLevel;
}

export interface Guardrails {
  dayType: DayType;
  band: ScoreBand;
  rows: GuardrailRow[];
}

function scoreToBand(score: number): ScoreBand {
  if (score >= 90) return "push-peak";
  if (score >= 75) return "push";
  if (score >= 62) return "maintain-high";
  if (score >= 50) return "maintain-low";
  if (score >= 32) return "recover";
  return "rest";
}

export interface GuardrailsOptions {
  /** User's actual wake time — "HH:MM" 24h. Defaults to "07:00". */
  wakeTime?: string;
  /** Label for cognitively demanding work. Defaults to "Deep work". */
  deepWorkLabel?: string;
  /** Label for lighter cognitive tasks. Defaults to "Admin / Comms". */
  lightWorkLabel?: string;
}

/** Derive a wind-down time from the user's 7-day average sleep + their wake time.
 *  Clamped between 9:00 PM and 11:30 PM. */
function deriveBedtime(
  avgSleepMinutes: number | null,
  wakeTime: string,
): string {
  const [wH, wM] = wakeTime.split(":").map(Number);
  const wakeMin = (wH ?? 7) * 60 + (wM ?? 0);

  if (avgSleepMinutes === null) {
    // No baseline yet — target 8h before wake
    const fallback = Math.max(21 * 60, Math.min(23 * 60 + 30, wakeMin - 8 * 60));
    return formatTime12h(fallback);
  }

  const targetBed = wakeMin - Math.round(avgSleepMinutes);
  const clamped = Math.max(21 * 60, Math.min(23 * 60 + 30, targetBed));
  return formatTime12h(clamped);
}

function formatTime12h(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function computeGuardrails(
  dayType: DayType,
  score: number,
  avgSleepMinutes: number | null,
  options: GuardrailsOptions = {},
): Guardrails {
  const {
    wakeTime = "07:00",
    deepWorkLabel = "Deep work",
    lightWorkLabel = "Admin / Comms",
  } = options;

  const band = scoreToBand(score);
  const bedtime = deriveBedtime(avgSleepMinutes, wakeTime);
  const dw = deepWorkLabel;
  const lw = lightWorkLabel;

  const rows: GuardrailRow[] = (() => {
    switch (band) {
      case "push-peak":
        return [
          { label: dw, value: "Up to 3 blocks",          level: "ok" },
          { label: lw, value: "Unrestricted",             level: "ok" },
          { label: "Training",  value: "Full intensity ok",        level: "ok" },
          { label: "Tonight",   value: `Lights out by ${bedtime}`, level: "ok" },
        ];

      case "push":
        return [
          { label: dw, value: "Up to 2 blocks",           level: "ok" },
          { label: lw, value: "Unrestricted",              level: "ok" },
          { label: "Training",  value: "Hard session ok",           level: "ok" },
          { label: "Tonight",   value: `Lights out by ${bedtime}`,  level: "ok" },
        ];

      case "maintain-high":
        return [
          { label: dw, value: "2 focused blocks",          level: "ok" },
          { label: lw, value: "Cap at 90 min",             level: "moderate" },
          { label: "Training",  value: "Moderate–hard ok",          level: "moderate" },
          { label: "Tonight",   value: `Wind down by ${bedtime}`,   level: "ok" },
        ];

      case "maintain-low":
        return [
          { label: dw, value: "1 block max",               level: "moderate" },
          { label: lw, value: "Batch + 2 sessions",        level: "moderate" },
          { label: "Training",  value: "Moderate only",            level: "moderate" },
          { label: "Tonight",   value: `Wind down by ${bedtime}`,  level: "ok" },
        ];

      case "recover":
        return [
          { label: dw, value: "Light reading only",        level: "avoid" },
          { label: lw, value: "Urgent items only",         level: "moderate" },
          { label: "Training",  value: "Walk or stretch only",     level: "avoid" },
          { label: "Tonight",   value: `In bed by ${bedtime}`,     level: "ok" },
        ];

      case "rest":
        return [
          { label: dw, value: "Avoid",                     level: "avoid" },
          { label: lw, value: "Defer if possible",         level: "avoid" },
          { label: "Training",  value: "Full rest",                level: "avoid" },
          { label: "Tonight",   value: `In bed by ${bedtime}`,     level: "ok" },
        ];
    }
  })();

  return { dayType, band, rows };
}
