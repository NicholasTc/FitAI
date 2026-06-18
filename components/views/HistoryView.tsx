"use client";

/**
 * HistoryView — full manual-log calendar.
 *
 * Shows a month grid. Each day cell:
 *   - Background tint from stored day type (ScoreAudit)
 *   - Dot for reflection (color = accuracy)
 *   - Circle outline for check-in
 *   - Barbell icon count for workouts
 *
 * Only days with ≥1 manual log are interactive by default.
 * Tapping a day opens HistoryDayPanel.
 *
 * On mount: triggers a best-effort 30-day wearable backfill so day detail
 * has context (non-blocking — calendar renders immediately from manual logs).
 */

import { AppIcon } from "@/components/AppIcon";
import { useEffect, useState } from "react";
import HistoryDayPanel from "./HistoryDayPanel";
import type { HistoryDaySummary, HistoryMonthResponse } from "@/types/history";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function yyyyMM(d: Date) {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

function prevMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Days in month: [0..N-1] 1-based date strings + leading null padding */
function buildMonthGrid(ym: string): (string | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay(); // 0=Sun
  const days = new Date(y, m, 0).getDate();
  // Start week on Monday: shift (0=Sun → 6)
  const pad = (firstDay + 6) % 7;
  const cells: (string | null)[] = Array(pad).fill(null);
  for (let i = 1; i <= days; i++) {
    cells.push(`${ym}-${String(i).padStart(2, "0")}`);
  }
  return cells;
}

const TODAY = new Date().toISOString().slice(0, 10);

// ─── Cell rendering ───────────────────────────────────────────────────────────

const DAY_TYPE_BG: Record<string, string> = {
  push:     "bg-[#fff0ee]",
  maintain: "bg-[#edfaf5]",
  recover:  "bg-[#f4f0ff]",
};

const ACCURACY_DOT: Record<string, string> = {
  yes:      "bg-[#009e83]",
  somewhat: "bg-[#e8a022]",
  no:       "bg-[#e05f3c]",
};

interface DayCell {
  date:    string;
  summary: HistoryDaySummary | null;
  isToday: boolean;
}

function CalendarCell({
  cell,
  onClick,
}: {
  cell: DayCell;
  onClick: (date: string) => void;
}) {
  const { date, summary, isToday } = cell;
  const dayNum = parseInt(date.slice(8), 10);
  const hasManual = summary && (summary.hasCheckIn || summary.hasReflection || summary.workoutCount > 0);
  const dtBg = summary?.dayType ? DAY_TYPE_BG[summary.dayType] : "";

  return (
    <button
      disabled={!hasManual}
      onClick={() => hasManual && onClick(date)}
      className={`
        relative flex flex-col items-center rounded-[10px] p-1.5 transition-all
        ${hasManual ? "cursor-pointer hover:brightness-95" : "cursor-default opacity-40"}
        ${dtBg || "bg-transparent"}
        ${isToday ? "ring-2 ring-[#4a7df6] ring-offset-1" : ""}
      `}
    >
      {/* Date number */}
      <span className={`text-[12.5px] font-medium ${isToday ? "font-bold text-[#4a7df6]" : "text-[#1b2040]"}`}>
        {dayNum}
      </span>

      {/* Indicators row */}
      {hasManual && (
        <div className="mt-0.5 flex items-center gap-0.5">
          {/* Reflection dot */}
          {summary.hasReflection && (
            <span
              className={`h-2 w-2 rounded-full ${ACCURACY_DOT[summary.reflectionAccuracy ?? ""] ?? "bg-[#4a7df6]"}`}
              title={`Reflection: ${summary.reflectionAccuracy ?? "submitted"}`}
            />
          )}
          {/* Check-in ring */}
          {summary.hasCheckIn && !summary.hasReflection && (
            <span
              className="h-2 w-2 rounded-full border border-[#4a7df6]"
              title="Check-in"
            />
          )}
          {summary.hasCheckIn && summary.hasReflection && (
            <span
              className="h-1.5 w-1.5 rounded-full border border-[#4a7df6] bg-transparent"
              title="Check-in"
            />
          )}
          {/* Workout count */}
          {summary.workoutCount > 0 && (
            <span
              className="flex h-2 w-2 items-center justify-center rounded-full bg-[#e05f3c]"
              title={`${summary.workoutCount} workout${summary.workoutCount > 1 ? "s" : ""}`}
            >
              {summary.workoutCount > 1 && (
                <span className="text-[7px] font-bold leading-none text-white">{summary.workoutCount}</span>
              )}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ─── Month stats bar ──────────────────────────────────────────────────────────

function MonthStats({ data }: { data: HistoryMonthResponse }) {
  const { stats } = data;
  const totalReflections = stats.reflectionsSubmitted;
  const accuracyPct = totalReflections > 0
    ? Math.round((stats.accuracyYes / totalReflections) * 100)
    : null;

  return (
    <div className="flex flex-wrap gap-3 rounded-[14px] border border-[rgba(148,162,218,0.14)] bg-white/70 px-4 py-3 backdrop-blur-sm">
      {[
        { label: "Reflections",   value: stats.reflectionsSubmitted },
        { label: "Check-ins",     value: stats.checkInsSubmitted },
        { label: "Workouts",      value: stats.workoutsLogged },
        { label: "Accuracy",      value: accuracyPct !== null ? `${accuracyPct}%` : "—" },
      ].map(({ label, value }) => (
        <div key={label} className="flex flex-col">
          <span className="text-[18px] font-bold text-[#1b2040]">{value}</span>
          <span className="text-[11px] text-[#9ea8c4]">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#9ea8c4] w-full">Legend</p>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#009e83]" />
        <span className="text-[11px] text-[#63708f]">Accurate reflection</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e8a022]" />
        <span className="text-[11px] text-[#63708f]">Somewhat accurate</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e05f3c]" />
        <span className="text-[11px] text-[#63708f]">Inaccurate reflection</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border border-[#4a7df6]" />
        <span className="text-[11px] text-[#63708f]">Check-in only</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e05f3c]" />
        <span className="text-[11px] text-[#63708f]">Workout logged</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[4px] bg-[#edfaf5]" />
        <span className="text-[11px] text-[#63708f]">Maintain</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[4px] bg-[#fff0ee]" />
        <span className="text-[11px] text-[#63708f]">Push</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[4px] bg-[#f4f0ff]" />
        <span className="text-[11px] text-[#63708f]">Recover</span>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function HistoryView() {
  const [month,       setMonth]       = useState(yyyyMM(new Date()));
  const [data,        setData]        = useState<HistoryMonthResponse | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Fetch month data
  useEffect(() => {
    setLoading(true);
    fetch(`/api/history?month=${month}`)
      .then((r) => r.json() as Promise<HistoryMonthResponse>)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [month]);

  // Best-effort 30-day wearable backfill on mount (non-blocking)
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    void fetch(`/api/sync?days=30&date=${today}`, { method: "POST" }).catch(() => {/* ignore */});
  }, []);

  // Build grid
  const cells = buildMonthGrid(month);
  const summaryMap = new Map((data?.days ?? []).map((d) => [d.date, d]));

  const earliest = data?.earliestManualDate ?? null;
  const canGoPrev = !earliest || prevMonth(month) >= earliest.slice(0, 7);
  const canGoNext = month < yyyyMM(new Date());

  const activeDaysCount = (data?.days ?? []).filter(
    (d) => d.hasCheckIn || d.hasReflection || d.workoutCount > 0,
  ).length;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">

      {/* Month navigator */}
      <div className="flex items-center justify-between rounded-2xl border border-[rgba(148,162,218,0.18)] bg-white/70 px-4 py-3 backdrop-blur-sm">
        <button
          disabled={!canGoPrev}
          onClick={() => setMonth(prevMonth(month))}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-[#63708f] transition-colors hover:bg-[#f4f5fb] disabled:opacity-30"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="text-center">
          <p className="text-[15px] font-bold text-[#1b2040]">{monthLabel(month)}</p>
          {!loading && data && (
            <p className="text-[11px] text-[#9ea8c4]">
              {activeDaysCount} {activeDaysCount === 1 ? "day" : "days"} with logs
            </p>
          )}
        </div>

        <button
          disabled={!canGoNext}
          onClick={() => setMonth(nextMonth(month))}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-[#63708f] transition-colors hover:bg-[#f4f5fb] disabled:opacity-30"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Stats bar */}
      {!loading && data && <MonthStats data={data} />}

      {/* Calendar grid */}
      <div className="rounded-2xl border border-[rgba(148,162,218,0.18)] bg-white/70 p-4 backdrop-blur-sm">
        {/* Weekday headers (Mon–Sun) */}
        <div className="mb-2 grid grid-cols-7 gap-1">
          {["Mo","Tu","We","Th","Fr","Sa","Su"].map((d) => (
            <div key={d} className="text-center text-[10.5px] font-semibold uppercase tracking-wider text-[#9ea8c4]">
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <p className="text-[13px] text-[#9ea8c4]">Loading…</p>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((date, i) =>
              date ? (
                <CalendarCell
                  key={date}
                  cell={{ date, summary: summaryMap.get(date) ?? null, isToday: date === TODAY }}
                  onClick={setSelectedDay}
                />
              ) : (
                <div key={`pad-${i}`} />
              )
            )}
          </div>
        )}

        {!loading && data && activeDaysCount === 0 && (
          <p className="mt-4 text-center text-[12.5px] text-[#9ea8c4]">
            No manual logs this month — check-ins, reflections, and workouts will appear here.
          </p>
        )}
      </div>

      {/* Legend */}
      <Legend />

      {/* Earliest log note */}
      {!loading && data?.earliestManualDate && (
        <p className="text-center text-[11px] text-[#b0baca]">
          Your earliest log: {new Date(data.earliestManualDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      )}

      {!loading && !data?.earliestManualDate && (
        <div className="rounded-2xl border border-[rgba(148,162,218,0.14)] bg-[#f4f5fb] p-5 text-center">
          <AppIcon name="history" size={24} className="mx-auto mb-2 text-[#9ea8c4]" />
          <p className="text-[13px] font-semibold text-[#1b2040]">No manual logs yet</p>
          <p className="mt-1 text-[12px] text-[#9ea8c4]">
            Complete a morning check-in, a night reflection, or log a workout — they'll all show up here.
          </p>
        </div>
      )}

      {/* Day detail panel */}
      {selectedDay && (
        <HistoryDayPanel
          date={selectedDay}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
