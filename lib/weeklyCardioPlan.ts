/**
 * Adaptive weekly cardio plan — Feature 5.
 *
 * Stateless: recomputed from this week's zone progress + current Stimulus Reserve.
 * No persisted plan rows for v1.
 */

import type { WeeklyZoneMinutes } from "@/lib/zoneMinutes";
import type { StimulusReserveResult, SuggestedZone } from "@/lib/stimulusReserve";

export type PlanSessionKind =
  | "fat_burn"
  | "interval"
  | "recovery"
  | "rest"
  | "done";

export interface PlanDay {
  date: string;
  weekday: string;
  kind: PlanSessionKind;
  label: string;
  /** Suggested minutes; null for rest / done. */
  minutes: number | null;
  /** True when this calendar day is today or earlier and already has zone minutes. */
  completed: boolean;
}

export interface WeeklyCardioPlan {
  days: PlanDay[];
  remainingModerateMin: number;
  remainingVigorousMin: number;
  summary: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function weekdayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return WEEKDAYS[d.getDay()]!;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function kindFromReserve(zone: SuggestedZone): PlanSessionKind {
  if (zone === "rest") return "rest";
  if (zone === "recovery") return "recovery";
  if (zone === "cardio") return "interval";
  return "fat_burn";
}

function labelFor(kind: PlanSessionKind, minutes: number | null): string {
  switch (kind) {
    case "fat_burn":
      return minutes ? `Fat Burn ${minutes} min` : "Fat Burn";
    case "interval":
      return minutes ? `Interval ${minutes} min` : "Interval session";
    case "recovery":
      return minutes ? `Recovery cardio ${minutes} min` : "Recovery cardio";
    case "rest":
      return "Rest";
    case "done":
      return "Completed";
  }
}

/**
 * Build remaining-week suggestions from Mon→Sun for the week containing `todayDate`.
 */
export function computeWeeklyCardioPlan(
  zones: WeeklyZoneMinutes,
  reserve: StimulusReserveResult,
  todayDate: string,
): WeeklyCardioPlan {
  const days: PlanDay[] = [];
  let remainingMod = zones.progress.moderateRemaining;
  let remainingVig = zones.progress.vigorousRemaining;

  for (let i = 0; i < 7; i++) {
    const date = addDays(zones.weekStart, i);
    const existing = zones.week.find((d) => d.date === date);
    const alreadyDone = Boolean(existing && existing.totalZoneMin >= 20);

    if (date < todayDate || alreadyDone) {
      days.push({
        date,
        weekday: weekdayLabel(date),
        kind: alreadyDone || date < todayDate ? (alreadyDone ? "done" : "rest") : "rest",
        label: alreadyDone
          ? `Logged ${existing!.totalZoneMin} min`
          : date < todayDate
            ? "—"
            : "Rest",
        minutes: alreadyDone ? existing!.totalZoneMin : null,
        completed: alreadyDone,
      });
      continue;
    }

    // Future / today: allocate based on reserve + remaining targets
    let kind: PlanSessionKind;
    let minutes: number | null;

    if (date === todayDate) {
      kind = kindFromReserve(reserve.suggestedZone);
      minutes =
        kind === "rest"
          ? null
          : kind === "recovery"
            ? 25
            : kind === "interval"
              ? Math.min(45, Math.max(30, remainingVig + 20))
              : Math.min(50, Math.max(30, Math.round(remainingMod / 2) || 40));
    } else {
      // Spread remaining targets across leftover weekdays
      const dow = new Date(`${date}T12:00:00`).getDay();
      if (remainingMod <= 0 && remainingVig <= 0) {
        kind = "rest";
        minutes = null;
      } else if (dow === 3 || dow === 6) {
        // Wed / Sat — interval if vigorous remaining
        if (remainingVig >= 15) {
          kind = "interval";
          minutes = Math.min(40, remainingVig);
          remainingVig -= minutes;
        } else if (remainingMod >= 20) {
          kind = "fat_burn";
          minutes = Math.min(40, remainingMod);
          remainingMod -= minutes;
        } else {
          kind = "recovery";
          minutes = 25;
        }
      } else if (dow === 5) {
        kind = remainingMod > 0 || remainingVig > 0 ? "recovery" : "rest";
        minutes = kind === "recovery" ? 25 : null;
      } else if (remainingMod >= 25) {
        kind = "fat_burn";
        minutes = Math.min(45, Math.max(30, Math.round(remainingMod / 2)));
        remainingMod -= minutes;
      } else {
        kind = "rest";
        minutes = null;
      }
    }

    days.push({
      date,
      weekday: weekdayLabel(date),
      kind,
      label: labelFor(kind, minutes),
      minutes,
      completed: false,
    });
  }

  const remainingModerateMin = zones.progress.moderateRemaining;
  const remainingVigorousMin = zones.progress.vigorousRemaining;
  const summary =
    remainingModerateMin + remainingVigorousMin <= 0
      ? "Weekly zone targets met — protect recovery."
      : `Remaining this week: ${remainingModerateMin} min Fat Burn, ${remainingVigorousMin} min Cardio/Peak.`;

  return {
    days,
    remainingModerateMin,
    remainingVigorousMin,
    summary,
  };
}
