/**
 * Weekly cardio-zone tracker — Feature 2.
 *
 * Primary source: Karvonen (heart-rate-reserve) cardio zones from
 * `daily-heart-rate-zones` + `time-in-heart-rate-zone` — LIGHT / MODERATE /
 * VIGOROUS / PEAK, with personalized bpm boundaries. See docs/cardio-zones-plan.md.
 *
 * Falls back to Fitbit Active Zone Minutes (`active-zone-minutes`,
 * FAT_BURN / CARDIO / PEAK) for any day synced before the Karvonen zones
 * shipped — Fat Burn ≈ moderate, Cardio+Peak ≈ vigorous, same mapping this
 * module always used. The fallback is per-day, so a mixed-source week (some
 * days old data, some new) still produces a sane weekly total.
 */

import type { DailySnapshot } from "@/types/snapshot";
import { DEFAULT_SETTINGS } from "@/types/today";

export interface ZoneTargets {
  weeklyModerateTargetMin: number;
  weeklyVigorousTargetMin: number;
}

export interface CardioZoneBpm {
  minBpm: number | null;
  maxBpm: number | null;
}

export interface CardioZoneBpmRanges {
  light: CardioZoneBpm;
  moderate: CardioZoneBpm;
  vigorous: CardioZoneBpm;
  peak: CardioZoneBpm;
}

export interface DayZoneMinutes {
  date: string;
  /** Legacy AZM (Fitbit Fat Burn / Cardio / Peak) — fallback source only. */
  fatBurnMin: number;
  cardioMin: number;
  peakMin: number;
  /** Karvonen zones — minutes spent in each, when available for this day. */
  zoneLightMin: number;
  zoneModerateMin: number;
  zoneVigorousMin: number;
  zonePeakMin: number;
  /** True when moderateMin/vigorousMin below came from the Karvonen zones
   *  rather than the legacy AZM fallback. */
  usedKarvonenZones: boolean;
  /** Moderate-or-above minutes counted toward the weekly moderate target. */
  moderateMin: number;
  /** Vigorous-or-above minutes counted toward the weekly vigorous target. */
  vigorousMin: number;
  totalZoneMin: number;
  /** Personalized bpm boundaries per zone for this day (null when unavailable). */
  bpm: CardioZoneBpmRanges;
}

export interface WeeklyZoneMinutes {
  today: DayZoneMinutes;
  week: DayZoneMinutes[];
  weekTotals: {
    fatBurnMin: number;
    cardioMin: number;
    peakMin: number;
    zoneLightMin: number;
    zoneModerateMin: number;
    zoneVigorousMin: number;
    zonePeakMin: number;
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

  const zoneLightMin = s.zoneLightMin ?? 0;
  const zoneModerateMin = s.zoneModerateMin ?? 0;
  const zoneVigorousMin = s.zoneVigorousMin ?? 0;
  const zonePeakMin = s.zonePeakMin ?? 0;

  // A day only counts as "has Karvonen zones" once any of the four minute
  // fields is non-null — a successful sync stores 0 for zones with no time
  // spent, so present-but-zero is real data (same rule as AZM parsing).
  const usedKarvonenZones =
    s.zoneLightMin !== null ||
    s.zoneModerateMin !== null ||
    s.zoneVigorousMin !== null ||
    s.zonePeakMin !== null;

  const moderateMin = usedKarvonenZones ? zoneModerateMin : fatBurnMin;
  const vigorousMin = usedKarvonenZones
    ? zoneVigorousMin + zonePeakMin
    : cardioMin + peakMin;

  return {
    date: s.date,
    fatBurnMin,
    cardioMin,
    peakMin,
    zoneLightMin,
    zoneModerateMin,
    zoneVigorousMin,
    zonePeakMin,
    usedKarvonenZones,
    moderateMin,
    vigorousMin,
    totalZoneMin: moderateMin + vigorousMin,
    bpm: {
      light: { minBpm: s.zoneLightMinBpm, maxBpm: s.zoneLightMaxBpm },
      moderate: { minBpm: s.zoneModerateMinBpm, maxBpm: s.zoneModerateMaxBpm },
      vigorous: { minBpm: s.zoneVigorousMinBpm, maxBpm: s.zoneVigorousMaxBpm },
      peak: { minBpm: s.zonePeakMinBpm, maxBpm: s.zonePeakMaxBpm },
    },
  };
}

function emptyDay(date: string): DayZoneMinutes {
  return {
    date,
    fatBurnMin: 0,
    cardioMin: 0,
    peakMin: 0,
    zoneLightMin: 0,
    zoneModerateMin: 0,
    zoneVigorousMin: 0,
    zonePeakMin: 0,
    usedKarvonenZones: false,
    moderateMin: 0,
    vigorousMin: 0,
    totalZoneMin: 0,
    bpm: {
      light: { minBpm: null, maxBpm: null },
      moderate: { minBpm: null, maxBpm: null },
      vigorous: { minBpm: null, maxBpm: null },
      peak: { minBpm: null, maxBpm: null },
    },
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
      zoneLightMin: acc.zoneLightMin + d.zoneLightMin,
      zoneModerateMin: acc.zoneModerateMin + d.zoneModerateMin,
      zoneVigorousMin: acc.zoneVigorousMin + d.zoneVigorousMin,
      zonePeakMin: acc.zonePeakMin + d.zonePeakMin,
      moderateMin: acc.moderateMin + d.moderateMin,
      vigorousMin: acc.vigorousMin + d.vigorousMin,
      totalZoneMin: acc.totalZoneMin + d.totalZoneMin,
    }),
    {
      fatBurnMin: 0,
      cardioMin: 0,
      peakMin: 0,
      zoneLightMin: 0,
      zoneModerateMin: 0,
      zoneVigorousMin: 0,
      zonePeakMin: 0,
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
