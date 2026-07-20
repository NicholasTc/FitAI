"use client";

/**
 * HistoryView — full manual-log calendar.
 *
 * Shows a month grid. Each day cell:
 *   - Background tint from stored day type (ScoreAudit)
 *   - Dot for reflection (color = accuracy)
 *   - Ring for check-in
 *   - Dot for workouts
 *
 * Only days with ≥1 manual log are interactive by default.
 * Tapping a day opens HistoryDayPanel.
 *
 * Wearable backfill is opt-in ("Catch up") — not on every calendar open.
 */

import { useEffect, useState } from "react";
import { GOOGLE_HEALTH_SYNC } from "@/lib/googleHealth/config";
import HistoryDayPanel from "./HistoryDayPanel";
import type { HistoryDaySummary, HistoryMonthResponse } from "@/types/history";

const BACKFILL_DAYS = GOOGLE_HEALTH_SYNC.historyBackfillDays;
const BACKFILL_DONE_KEY = "fitai:history-backfill-done";

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
  push:     "bg-[rgba(239,91,91,0.14)]",
  maintain: "bg-[rgba(88,194,122,0.14)]",
  recover:  "bg-[rgba(139,124,246,0.16)]",
};

const ACCURACY_DOT: Record<string, string> = {
  yes:      "bg-[#58c27a]",
  somewhat: "bg-[#e8b45a]",
  no:       "bg-[#ef5b5b]",
};

interface DayCell {
  date:    string;
  summary: HistoryDaySummary | null;
  isToday: boolean;
}

function CalendarCell({ cell, onClick }: { cell: DayCell; onClick: (date: string) => void }) {
  const { date, summary, isToday } = cell;
  const dayNum = parseInt(date.slice(8), 10);
  const hasManual = summary && (summary.hasCheckIn || summary.hasReflection || summary.workoutCount > 0);
  const dtBg = summary?.dayType ? DAY_TYPE_BG[summary.dayType] : "";

  return (
    <button
      disabled={!hasManual}
      onClick={() => hasManual && onClick(date)}
      className={`
        relative flex aspect-square flex-col items-center justify-center rounded-[10px] p-1 transition
        ${hasManual ? "cursor-pointer hover:brightness-125" : "cursor-default opacity-45"}
        ${dtBg || "bg-transparent"}
        ${isToday ? "ring-2 ring-[#b7ec4a] ring-offset-2 ring-offset-[#0b0d10]" : ""}
      `}
    >
      <span className={`text-[12.5px] font-medium ${isToday ? "font-bold text-[#b7ec4a]" : "text-[#f4f6f2]"}`}>
        {dayNum}
      </span>

      {hasManual && (
        <div className="mt-0.5 flex items-center gap-0.5">
          {summary.hasReflection && (
            <span
              className={`h-2 w-2 rounded-full ${ACCURACY_DOT[summary.reflectionAccuracy ?? ""] ?? "bg-[#9aa398]"}`}
              title={`Reflection: ${summary.reflectionAccuracy ?? "submitted"}`}
            />
          )}
          {summary.hasCheckIn && (
            <span className="h-2 w-2 rounded-full border border-[#8b7cf6]" title="Check-in" />
          )}
          {summary.workoutCount > 0 && (
            <span
              className="flex h-2 w-2 items-center justify-center rounded-full bg-[#b7ec4a]"
              title={`${summary.workoutCount} workout${summary.workoutCount > 1 ? "s" : ""}`}
            >
              {summary.workoutCount > 1 && (
                <span className="text-[7px] font-bold leading-none text-[#0c1004]">{summary.workoutCount}</span>
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
  const accuracyPct = totalReflections > 0 ? Math.round((stats.accuracyYes / totalReflections) * 100) : null;

  return (
    <div className="gcard flex flex-wrap gap-5 px-4 py-3">
      {[
        { label: "Reflections", value: stats.reflectionsSubmitted },
        { label: "Check-ins", value: stats.checkInsSubmitted },
        { label: "Workouts", value: stats.workoutsLogged },
        { label: "Accuracy", value: accuracyPct !== null ? `${accuracyPct}%` : "—" },
      ].map(({ label, value }) => (
        <div key={label} className="flex flex-col">
          <span className="text-[18px] font-bold text-[#f4f6f2]">{value}</span>
          <span className="text-[11px] text-[#6d766b]">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { c: "bg-[#58c27a]", label: "Accurate reflection" },
    { c: "bg-[#e8b45a]", label: "Somewhat accurate" },
    { c: "bg-[#ef5b5b]", label: "Inaccurate" },
    { c: "border border-[#8b7cf6]", label: "Check-in" },
    { c: "bg-[#b7ec4a]", label: "Workout logged" },
  ];
  const tints = [
    { c: "bg-[rgba(239,91,91,0.4)]", label: "Push" },
    { c: "bg-[rgba(88,194,122,0.4)]", label: "Maintain" },
    { c: "bg-[rgba(139,124,246,0.5)]", label: "Recover" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
      <p className="w-full text-[10px] font-[650] uppercase tracking-[1.2px] text-[#6d766b]">Legend</p>
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${it.c}`} />
          <span className="text-[11px] text-[#9aa398]">{it.label}</span>
        </div>
      ))}
      {tints.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-[4px] ${it.c}`} />
          <span className="text-[11px] text-[#9aa398]">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Opt-in wearable backfill ─────────────────────────────────────────────────

type BackfillState = "idle" | "running" | "done" | "error";

function readBackfillDone(): boolean {
  try {
    return Boolean(localStorage.getItem(BACKFILL_DONE_KEY));
  } catch {
    return false;
  }
}

function markBackfillDone(): void {
  try {
    localStorage.setItem(BACKFILL_DONE_KEY, new Date().toISOString());
  } catch {
    /* ignore quota / private mode */
  }
}

function WearableBackfillBar() {
  const [hasDoneOnce, setHasDoneOnce] = useState(false);
  const [state, setState] = useState<BackfillState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setHasDoneOnce(readBackfillDone());
  }, []);

  async function runBackfill() {
    if (state === "running") return;
    setState("running");
    setMessage(null);
    const today = new Date().toLocaleDateString("en-CA");
    try {
      const res = await fetch(
        `/api/sync?days=${BACKFILL_DAYS}&date=${today}`,
        { method: "POST" },
      );
      if (!res.ok) {
        throw new Error(`Sync failed (${res.status})`);
      }
      const body = (await res.json()) as {
        sync?: { apiError?: string | null; daysSynced?: number; daysSkipped?: number };
      };
      if (body.sync?.apiError) {
        setState("error");
        setMessage(body.sync.apiError);
        return;
      }
      markBackfillDone();
      setHasDoneOnce(true);
      setState("done");
      const fetched = body.sync?.daysSynced ?? 0;
      const skipped = body.sync?.daysSkipped ?? 0;
      setMessage(
        fetched === 0
          ? `Wearable history already up to date (${skipped} days).`
          : `Caught up ${fetched} day${fetched === 1 ? "" : "s"} (${skipped} already fresh).`,
      );
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Catch up failed");
    }
  }

  const prominent = !hasDoneOnce && state !== "done";

  return (
    <div className="gcard flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-[#f4f6f2]">
          {prominent ? "Catch up wearable history" : "Wearable history"}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-[#6d766b]">
          {message ??
            (prominent
              ? `Pull the last ${BACKFILL_DAYS} days from Google Health once — not run automatically.`
              : `Optional refresh of the last ${BACKFILL_DAYS} days for day detail context.`)}
        </p>
      </div>
      <button
        type="button"
        disabled={state === "running"}
        onClick={() => void runBackfill()}
        className={`
          shrink-0 rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold transition
          disabled:cursor-wait disabled:opacity-60
          ${
            prominent
              ? "bg-[#b7ec4a] text-[#0c1004] hover:brightness-110"
              : "bg-[rgba(255,255,255,0.06)] text-[#f4f6f2] hover:bg-[rgba(255,255,255,0.1)]"
          }
        `}
      >
        {state === "running"
          ? "Catching up…"
          : prominent
            ? `Catch up (${BACKFILL_DAYS}d)`
            : "Refresh"}
      </button>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface HistoryViewProps {
  /** When true, drops the max-width wrapper so it fills an embedding container. */
  embedded?: boolean;
}

export default function HistoryView({ embedded = false }: HistoryViewProps) {
  const [month, setMonth] = useState(yyyyMM(new Date()));
  const [data, setData] = useState<HistoryMonthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/history?month=${month}`)
      .then((r) => r.json() as Promise<HistoryMonthResponse>)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [month]);

  const cells = buildMonthGrid(month);
  const summaryMap = new Map((data?.days ?? []).map((d) => [d.date, d]));

  const earliest = data?.earliestManualDate ?? null;
  const canGoPrev = !earliest || prevMonth(month) >= earliest.slice(0, 7);
  const canGoNext = month < yyyyMM(new Date());

  const activeDaysCount = (data?.days ?? []).filter(
    (d) => d.hasCheckIn || d.hasReflection || d.workoutCount > 0,
  ).length;

  return (
    <div className={embedded ? "flex flex-col gap-3" : "screen-in mx-auto flex max-w-xl flex-col gap-3"}>
      {/* Month navigator */}
      <div className="gcard flex items-center justify-between px-4 py-3">
        <button
          disabled={!canGoPrev}
          onClick={() => setMonth(prevMonth(month))}
          className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#9aa398] transition hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-30"
          aria-label="Previous month"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="text-center">
          <p className="text-[15px] font-bold text-[#f4f6f2]">{monthLabel(month)}</p>
          {!loading && data && (
            <p className="text-[11px] text-[#6d766b]">
              {activeDaysCount} {activeDaysCount === 1 ? "day" : "days"} with logs
            </p>
          )}
        </div>

        <button
          disabled={!canGoNext}
          onClick={() => setMonth(nextMonth(month))}
          className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#9aa398] transition hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-30"
          aria-label="Next month"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {!loading && data && <MonthStats data={data} />}

      <WearableBackfillBar />

      {/* Calendar grid */}
      <div className="gcard p-4">
        <div className="mb-2 grid grid-cols-7 gap-1">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
            <div key={d} className="text-center text-[10px] font-[650] uppercase tracking-wider text-[#6d766b]">
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <p className="text-[13px] text-[#6d766b]">Loading…</p>
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
              ),
            )}
          </div>
        )}

        {!loading && data && activeDaysCount === 0 && (
          <p className="mt-4 text-center text-[12.5px] text-[#6d766b]">
            No manual logs this month — check-ins, reflections, and workouts appear here.
          </p>
        )}
      </div>

      <Legend />

      {!loading && data?.earliestManualDate && (
        <p className="text-center text-[11px] text-[#6d766b]">
          Your earliest log:{" "}
          {new Date(data.earliestManualDate + "T12:00:00").toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      )}

      {!loading && !data?.earliestManualDate && (
        <div className="gcard p-5 text-center">
          <p className="text-[13px] font-semibold text-[#f4f6f2]">No manual logs yet</p>
          <p className="mt-1 text-[12px] text-[#6d766b]">
            Complete a morning check-in, a night reflection, or log a workout — they&apos;ll all show up here.
          </p>
        </div>
      )}

      {selectedDay && <HistoryDayPanel date={selectedDay} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}
