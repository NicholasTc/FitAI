"use client";

import { AppIcon, type FitAIIconName } from "@/components/AppIcon";
import type { DailyBaseline, DailySnapshot, MetricDelta } from "@/types/snapshot";
import { useEffect, useState } from "react";

// ─── Formatting helpers ────────────────────────────────────────────────────────

function fmtSleep(minutes: number | null): string {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function fmtNum(value: number | null, decimals = 0, suffix = ""): string {
  if (value === null) return "—";
  return `${value.toFixed(decimals)}${suffix}`;
}

function deltaLabel(
  delta: MetricDelta,
  positiveIsGood = true,
  unit = "",
): string | null {
  if (delta.direction === null || delta.value === null) return null;
  if (delta.direction === "flat") return "At baseline";
  const sign = delta.value > 0 ? "+" : "";
  const good = positiveIsGood
    ? delta.direction === "up"
    : delta.direction === "down";
  const prefix = good ? "↑" : "↓";
  return `${prefix} ${sign}${Math.abs(delta.value).toFixed(1)}${unit} vs avg`;
}

// ─── Metric card ───────────────────────────────────────────────────────────────

interface CardProps {
  title: string;
  subtitle: string;
  value: string;
  delta?: string | null;
  deltaGood?: boolean; // true = green, false = amber
  accentColor: string; // Tailwind bg class for icon
  icon: FitAIIconName;
  iconClassName?: string;
  note?: string; // small footnote when data is null
}

function MetricCard({
  title,
  subtitle,
  value,
  delta,
  deltaGood,
  accentColor,
  icon,
  iconClassName,
  note,
}: CardProps) {
  return (
    <div className="rounded-[18px] border border-[rgba(148,162,218,0.16)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.07)]">
      <div className="mb-3 flex items-center gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${accentColor}`}
        >
          <AppIcon name={icon} size={18} className={iconClassName ?? "text-[#63708f]"} />
        </span>
        <div>
          <p className="text-[13px] font-semibold text-[#1b2040]">{title}</p>
          <p className="text-[11px] text-[#9ea8c4]">{subtitle}</p>
        </div>
      </div>

      <p
        className={`font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight ${value === "—" ? "text-[#c4cad8]" : "text-[#1b2040]"}`}
      >
        {value}
      </p>

      {delta && (
        <p
          className={`mt-1 text-[11.5px] font-medium ${deltaGood ? "text-[#009e83]" : "text-[#e05f3c]"}`}
        >
          {delta}
        </p>
      )}

      {!delta && note && (
        <p className="mt-1 text-[11.5px] text-[#9ea8c4]">{note}</p>
      )}
    </div>
  );
}

// ─── Baseline status banner ────────────────────────────────────────────────────

function BaselineBanner({
  daysWithData,
}: {
  daysWithData: number;
}) {
  if (daysWithData >= 5) return null;
  return (
    <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[rgba(74,125,246,0.18)] bg-[#eef3ff] px-4 py-3 text-sm text-[#4a7df6]">
      <AppIcon name="baseline" size={18} className="shrink-0" />
      <div>
        <span className="font-semibold">Baseline forming</span>
        <span className="ml-1 text-[#7fa0f8]">
          {daysWithData}/7 days of data — trends improve daily as your Fitbit
          calibrates.
        </span>
      </div>
    </div>
  );
}

// ─── History sparkline ─────────────────────────────────────────────────────────

function Sparkline({
  history,
  field,
}: {
  history: DailySnapshot[];
  field: keyof DailySnapshot;
}) {
  const values = history
    .map((s) => s[field] as number | null)
    .filter((v): v is number => v !== null);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const heights = values.map((v) => Math.round(((v - min) / range) * 100));

  return (
    <div className="mt-3 flex h-8 items-end gap-[3px]">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-[#c7d4fb] transition-all"
          style={{ height: `${Math.max(h, 6)}%` }}
        />
      ))}
    </div>
  );
}

// ─── Main dashboard ────────────────────────────────────────────────────────────

export default function DashboardContent() {
  const [data, setData] = useState<DailyBaseline | null>(null);
  const [syncing, setSyncing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const localDate = new Date().toLocaleDateString("en-CA");

    fetch(`/api/sync?date=${localDate}`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error(`Sync failed (${res.status})`);
        return res.json() as Promise<DailyBaseline>;
      })
      .then((json) => {
        setData(json);
        setSyncing(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setSyncing(false);
      });
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (syncing || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-[#9ea8c4]">
        <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
        Syncing your health data…
      </div>
    );
  }

  const { baseline, today, deltas, history } = data;
  const nullNote = "Not available yet";

  return (
    <>
      {/* Header summary */}
      <section className="mb-6 rounded-[22px] border border-[rgba(148,162,218,0.16)] bg-white p-6 shadow-[0_2px_14px_rgba(80,100,180,0.07)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-[#63708f]">Today&apos;s health snapshot</p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
              Key signals
            </h2>
            <p className="mt-1.5 text-sm text-[#63708f]">
              {today.date} · Synced from Google Health API
            </p>
          </div>
          <div className="rounded-2xl bg-[#f4f5fb] px-4 py-3 text-sm">
            <p className="text-[#9ea8c4]">Baseline</p>
            <p className="font-[family-name:var(--font-display)] text-2xl font-bold">
              {baseline.daysWithData}/7
              <span className="ml-1 text-xs font-normal text-[#9ea8c4]">days</span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#63708f]">
          <span className="rounded-full bg-[#f4f5fb] px-3 py-1.5">
            Date: {today.date}
          </span>
          <span
            className={`rounded-full px-3 py-1.5 ${baseline.status === "ready" ? "bg-[#ecfaf6] text-[#009e83]" : "bg-[#eef3ff] text-[#4a7df6]"}`}
          >
            Baseline: {baseline.status === "ready" ? "Ready" : "Forming"}
          </span>
        </div>
      </section>

      {/* Baseline forming notice */}
      <BaselineBanner daysWithData={baseline.daysWithData} />

      {/* Metric grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* Sleep */}
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.16)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.07)]">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#edf9f6] text-[#4a7df6]">
              <AppIcon name="sleep" size={18} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-[#1b2040]">Sleep</p>
              <p className="text-[11px] text-[#9ea8c4]">Duration & efficiency</p>
            </div>
          </div>
          <p
            className={`font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight ${today.sleepMinutes === null ? "text-[#c4cad8]" : "text-[#1b2040]"}`}
          >
            {fmtSleep(today.sleepMinutes)}
          </p>
          {today.sleepEfficiency !== null && (
            <p className="mt-0.5 text-[12px] text-[#63708f]">
              {fmtNum(today.sleepEfficiency, 0, "% efficiency")}
            </p>
          )}
          {deltaLabel(deltas.sleepMinutes, true, "m") && (
            <p
              className={`mt-1 text-[11.5px] font-medium ${deltas.sleepMinutes.direction === "up" ? "text-[#009e83]" : "text-[#e05f3c]"}`}
            >
              {deltaLabel(deltas.sleepMinutes, true, "m")}
            </p>
          )}
          {today.sleepMinutes === null && (
            <p className="mt-1 text-[11.5px] text-[#9ea8c4]">{nullNote}</p>
          )}
          {today.sleepDeepMin !== null && (
            <p className="mt-2 text-[11px] text-[#9ea8c4]">
              Deep {today.sleepDeepMin}m · REM {today.sleepRemMin ?? "—"}m ·
              Light {today.sleepLightMin ?? "—"}m
            </p>
          )}
          <Sparkline history={history} field="sleepMinutes" />
        </div>

        {/* Resting HR */}
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.16)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.07)]">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff5f2] text-[#e05f3c]">
              <AppIcon name="heart" size={18} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-[#1b2040]">Resting HR</p>
              <p className="text-[11px] text-[#9ea8c4]">Beats per minute</p>
            </div>
          </div>
          <p
            className={`font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight ${today.restingHr === null ? "text-[#c4cad8]" : "text-[#1b2040]"}`}
          >
            {fmtNum(today.restingHr, 0, " bpm")}
          </p>
          {deltaLabel(deltas.restingHr, false, " bpm") && (
            <p
              className={`mt-1 text-[11.5px] font-medium ${deltas.restingHr.direction === "down" ? "text-[#009e83]" : "text-[#e05f3c]"}`}
            >
              {deltaLabel(deltas.restingHr, false, " bpm")}
            </p>
          )}
          {today.restingHr === null && (
            <p className="mt-1 text-[11.5px] text-[#9ea8c4]">{nullNote}</p>
          )}
          <Sparkline history={history} field="restingHr" />
        </div>

        {/* HRV */}
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.16)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.07)]">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef3ff] text-[#7850e2]">
              <AppIcon name="hrv" size={18} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-[#1b2040]">HRV</p>
              <p className="text-[11px] text-[#9ea8c4]">Heart rate variability</p>
            </div>
          </div>
          <p
            className={`font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight ${today.hrv === null ? "text-[#c4cad8]" : "text-[#1b2040]"}`}
          >
            {fmtNum(today.hrv, 1, " ms")}
          </p>
          {deltaLabel(deltas.hrv, true, " ms") && (
            <p
              className={`mt-1 text-[11.5px] font-medium ${deltas.hrv.direction === "up" ? "text-[#009e83]" : "text-[#e05f3c]"}`}
            >
              {deltaLabel(deltas.hrv, true, " ms")}
            </p>
          )}
          {today.hrv === null && (
            <p className="mt-1 text-[11.5px] text-[#9ea8c4]">{nullNote}</p>
          )}
          <Sparkline history={history} field="hrv" />
        </div>

        {/* Steps */}
        <MetricCard
          title="Steps"
          subtitle="Daily step count"
          value={fmtNum(today.steps, 0)}
          delta={deltaLabel(deltas.steps, true)}
          deltaGood={deltas.steps.direction === "up"}
          accentColor="bg-[#ecfaf6]"
          icon="steps"
          iconClassName="text-[#009e83]"
          note={nullNote}
        />

        {/* Active Minutes */}
        <MetricCard
          title="Active Minutes"
          subtitle="Daily active time"
          value={fmtNum(today.activeMinutes, 0, " min")}
          delta={deltaLabel(deltas.activeMinutes, true, " min")}
          deltaGood={deltas.activeMinutes.direction === "up"}
          accentColor="bg-[#f4f0ff]"
          icon="energy"
          iconClassName="text-[#7850e2]"
          note={nullNote}
        />

        {/* 7-day baseline summary */}
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.16)] bg-[#f4f5fb] p-5">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#63708f]">
              <AppIcon name="chart" size={18} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-[#1b2040]">
                7-day averages
              </p>
              <p className="text-[11px] text-[#9ea8c4]">
                {baseline.daysWithData} day
                {baseline.daysWithData !== 1 ? "s" : ""} of data
              </p>
            </div>
          </div>
          <ul className="space-y-1.5 text-[12px] text-[#63708f]">
            <li className="flex justify-between">
              <span>Avg sleep</span>
              <span className="font-medium text-[#1b2040]">
                {fmtSleep(
                  baseline.sleepMinutes !== null
                    ? Math.round(baseline.sleepMinutes)
                    : null,
                )}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Avg resting HR</span>
              <span className="font-medium text-[#1b2040]">
                {fmtNum(
                  baseline.restingHr !== null
                    ? Math.round(baseline.restingHr)
                    : null,
                  0,
                  " bpm",
                )}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Avg HRV</span>
              <span className="font-medium text-[#1b2040]">
                {fmtNum(baseline.hrv, 1, " ms")}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Avg steps</span>
              <span className="font-medium text-[#1b2040]">
                {fmtNum(
                  baseline.steps !== null ? Math.round(baseline.steps) : null,
                  0,
                )}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Avg active min</span>
              <span className="font-medium text-[#1b2040]">
                {fmtNum(
                  baseline.activeMinutes !== null
                    ? Math.round(baseline.activeMinutes)
                    : null,
                  0,
                  " min",
                )}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
