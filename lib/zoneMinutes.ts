/**
 * Weekly cardio-zone tracker — Feature 2.
 *
 * Uses Google Health's native 3-zone model (FAT_BURN / CARDIO / PEAK).
 * FAT_BURN ≈ moderate; CARDIO+PEAK ≈ vigorous / high-intensity.
 */

import type { DailySnapshot } from "@/types/snapshot";
import { DEFAULT_SETTINGS } from "@/types/today";

export interface ZoneTargets {
  weeklyModerateTargetMin: number;
  weeklyVigorousTargetMin: number;
}

export interface DayZoneMinutes {
  date: string;
  fatBurnMin: number;
  cardioMin: number;
  peakMin: number;
  /** Fat Burn minutes (moderate proxy). */
  moderateMin: number;
  /** Cardio + Peak minutes (vigorous proxy). */
  vigorousMin: number;
  totalZoneMin: number;
}

export interface WeeklyZoneMinutes {
  today: DayZoneMinutes;
  week: DayZoneMinutes[];
  weekTotals: {
    fatBurnMin: number;
    cardioMin: number;
    peakMin: number;
    moderateMin: number;
    vigorousMin: number;
    totalZoneMin: number;
  };
  targets: ZoneTargets;
  progress: {
    moderatePct: number;
    vigorousPct: number;
    moderateRemaining: number;
    vigorousRemaining: number;
  };
  weekStart: string;
  weekEnd: string;
}

function startOfWeekMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function endOfWeekSunday(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function dayFromSnapshot(s: DailySnapshot): DayZoneMinutes {
  const fatBurnMin = s.fatBurnMin ?? 0;
  const cardioMin = s.cardioMin ?? 0;
  const peakMin = s.peakMin ?? 0;
  return {
    date: s.date,
    fatBurnMin,
    cardioMin,
    peakMin,
    moderateMin: fatBurnMin,
    vigorousMin: cardioMin + peakMin,
    totalZoneMin: fatBurnMin + cardioMin + peakMin,
  };
}

function emptyDay(date: string): DayZoneMinutes {
  return {
    date,
    fatBurnMin: 0,
    cardioMin: 0,
    peakMin: 0,
    moderateMin: 0,
    vigorousMin: 0,
    totalZoneMin: 0,
  };
}

/**
 * Compute today + current-week zone minutes vs weekly targets.
 * @param history — oldest → newest snapshots (should cover at least this week)
 * @param todayDate — YYYY-MM-DD
 */
export function computeWeeklyZoneMinutes(
  history: DailySnapshot[],
  todayDate: string,
  targets: ZoneTargets = {
    weeklyModerateTargetMin: DEFAULT_SETTINGS.weeklyModerateTargetMin,
    weeklyVigorousTargetMin: DEFAULT_SETTINGS.weeklyVigorousTargetMin,
  },
): WeeklyZoneMinutes {
  const weekStart = startOfWeekMonday(todayDate);
  const weekEnd = endOfWeekSunday(weekStart);
  const byDate = new Map(history.map((s) => [s.date, s]));

  const week: DayZoneMinutes[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    if (key > todayDate) break;
    const snap = byDate.get(key);
    week.push(snap ? dayFromSnapshot(snap) : emptyDay(key));
  }

  const todaySnap = byDate.get(todayDate);
  const today = todaySnap ? dayFromSnapshot(todaySnap) : emptyDay(todayDate);

  const weekTotals = week.reduce(
    (acc, d) => ({
      fatBurnMin: acc.fatBurnMin + d.fatBurnMin,
      cardioMin: acc.cardioMin + d.cardioMin,
      peakMin: acc.peakMin + d.peakMin,
      moderateMin: acc.moderateMin + d.moderateMin,
      vigorousMin: acc.vigorousMin + d.vigorousMin,
      totalZoneMin: acc.totalZoneMin + d.totalZoneMin,
    }),
    {
      fatBurnMin: 0,
      cardioMin: 0,
      peakMin: 0,
      moderateMin: 0,
      vigorousMin: 0,
      totalZoneMin: 0,
    },
  );

  const modTarget = Math.max(1, targets.weeklyModerateTargetMin);
  const vigTarget = Math.max(1, targets.weeklyVigorousTargetMin);

  return {
    today,
    week,
    weekTotals,
    targets,
    progress: {
      moderatePct: Math.min(100, Math.round((weekTotals.moderateMin / modTarget) * 100)),
      vigorousPct: Math.min(100, Math.round((weekTotals.vigorousMin / vigTarget) * 100)),
      moderateRemaining: Math.max(0, targets.weeklyModerateTargetMin - weekTotals.moderateMin),
      vigorousRemaining: Math.max(0, targets.weeklyVigorousTargetMin - weekTotals.vigorousMin),
    },
    weekStart,
    weekEnd,
  };
}
