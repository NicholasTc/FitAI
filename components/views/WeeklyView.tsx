"use client";

import { AppIcon } from "@/components/AppIcon";
import { useEffect, useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DayRow {
  date: string;
  dayType: "push" | "maintain" | "recover";
  score: number;
  sleepMinutes: number | null;
  hrv: number | null;
  restingHr: number | null;
  steps: number | null;
  hasCheckIn: boolean;
  reflection: {
    accuracy: string;
    outcome: string;
    note: string | null;
  } | null;
}

interface WeeklyData {
  weekOf: string;
  dayBreakdown: { push: number; maintain: number; recover: number };
  averages: {
    sleepMinutes: number | null;
    hrv: number | null;
    restingHr: number | null;
    steps: number | null;
    readinessScore: number | null;
  };
  accuracyStats: { total: number; yes: number; somewhat: number; no: number };
  history: DayRow[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const DAY_TYPE_STYLE = {
  push: { bg: "bg-[#fff3f0]", text: "text-[#e05f3c]", dot: "bg-[#e05f3c]", label: "Push" },
  maintain: { bg: "bg-[#ecfaf6]", text: "text-[#009e83]", dot: "bg-[#009e83]", label: "Maintain" },
  recover: { bg: "bg-[#f4f0ff]", text: "text-[#7850e2]", dot: "bg-[#7850e2]", label: "Recover" },
};

const ACCURACY_STYLE: Record<string, { label: string; color: string }> = {
  yes: { label: "Accurate", color: "text-[#009e83]" },
  somewhat: { label: "Somewhat", color: "text-[#c87a36]" },
  no: { label: "Off", color: "text-[#e05f3c]" },
};

const OUTCOME_STYLE: Record<string, { label: string }> = {
  great: { label: "Great" },
  good: { label: "Good" },
  skipped: { label: "Skipped" },
  rest: { label: "Rest" },
};

function fmtSleep(min: number | null): string {
  if (min === null) return "—";
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function fmtDay(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  iconName,
  iconColor,
}: {
  label: string;
  value: string;
  sub?: string;
  iconName: "sleep" | "hrv" | "heart" | "steps" | "ai";
  iconColor: string;
}) {
  return (
    <div className="rounded-[14px] border border-[rgba(148,162,218,0.14)] bg-white p-4 shadow-[0_1px_8px_rgba(80,100,180,0.05)]">
      <div className="mb-2 flex items-center gap-2">
        <AppIcon name={iconName} size={14} className={iconColor} />
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ea8c4]">
          {label}
        </p>
      </div>
      <p className="font-[family-name:var(--font-display)] text-[20px] font-bold text-[#1b2040]">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11.5px] text-[#9ea8c4]">{sub}</p>}
    </div>
  );
}

function DayTypePill({ type }: { type: "push" | "maintain" | "recover" }) {
  const s = DAY_TYPE_STYLE[type];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function WeeklyView() {
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const date = new Date().toLocaleDateString("en-CA");

  useEffect(() => {
    fetch(`/api/weekly?date=${date}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json() as Promise<WeeklyData>;
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [date]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <svg className="h-5 w-5 animate-spin text-[#4a7df6]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="ml-3 text-sm text-[#63708f]">Loading week…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-600">{error ?? "No data"}</div>
    );
  }

  const totalDays = data.history.length;
  const accuracyPct =
    data.accuracyStats.total > 0
      ? Math.round(
          ((data.accuracyStats.yes + data.accuracyStats.somewhat * 0.5) /
            data.accuracyStats.total) *
            100,
        )
      : null;

  return (
    <div className="space-y-6">
      {/* Day type breakdown */}
      <div>
        <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[#9ea8c4]">
          This week&apos;s day types
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(["push", "maintain", "recover"] as const).map((dt) => {
            const s = DAY_TYPE_STYLE[dt];
            const count = data.dayBreakdown[dt];
            const pct = totalDays > 0 ? Math.round((count / totalDays) * 100) : 0;
            return (
              <div
                key={dt}
                className={`rounded-[14px] border p-4 ${s.bg}`}
                style={{ borderColor: `${s.dot}33` }}
              >
                <p className={`font-[family-name:var(--font-display)] text-[28px] font-bold ${s.text}`}>
                  {count}
                </p>
                <p className={`text-[12px] font-semibold ${s.text}`}>{s.label}</p>
                <p className="text-[11px] text-[#9ea8c4]">{pct}% of week</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Averages */}
      <div>
        <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[#9ea8c4]">
          Weekly averages
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Sleep"
            value={fmtSleep(data.averages.sleepMinutes)}
            sub="avg / night"
            iconName="sleep"
            iconColor="text-[#4a7df6]"
          />
          <StatCard
            label="HRV"
            value={data.averages.hrv !== null ? `${data.averages.hrv} ms` : "—"}
            sub="avg"
            iconName="hrv"
            iconColor="text-[#7850e2]"
          />
          <StatCard
            label="Resting HR"
            value={data.averages.restingHr !== null ? `${data.averages.restingHr} bpm` : "—"}
            sub="avg"
            iconName="heart"
            iconColor="text-[#e05f3c]"
          />
          <StatCard
            label="Steps"
            value={data.averages.steps !== null ? Math.round(data.averages.steps).toLocaleString() : "—"}
            sub="avg / day"
            iconName="steps"
            iconColor="text-[#009e83]"
          />
        </div>
      </div>

      {/* Reflection accuracy */}
      {data.accuracyStats.total > 0 && (
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AppIcon name="reflect" size={15} className="text-[#4a7df6]" />
              <p className="text-[13px] font-semibold text-[#1b2040]">Recommendation accuracy</p>
            </div>
            {accuracyPct !== null && (
              <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-[12px] font-semibold text-[#4a7df6]">
                {accuracyPct}% on track
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {[
              { key: "yes", label: "Accurate", color: "bg-[#009e83]" },
              { key: "somewhat", label: "Somewhat", color: "bg-[#c87a36]" },
              { key: "no", label: "Off", color: "bg-[#e05f3c]" },
            ].map(({ key, label, color }) => {
              const count = data.accuracyStats[key as "yes" | "somewhat" | "no"];
              const pct = data.accuracyStats.total > 0
                ? Math.round((count / data.accuracyStats.total) * 100)
                : 0;
              return (
                <div key={key} className="flex-1 text-center">
                  <p className="font-[family-name:var(--font-display)] text-[20px] font-bold text-[#1b2040]">
                    {count}
                  </p>
                  <p className="text-[11px] text-[#63708f]">{label}</p>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#f4f5fb]">
                    <div
                      className={`h-full rounded-full transition-all ${color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[11.5px] text-[#9ea8c4]">
            Based on {data.accuracyStats.total} of {totalDays} reflections this week
          </p>
        </div>
      )}

      {/* Day-by-day table */}
      <div>
        <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[#9ea8c4]">
          Day by day
        </p>
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-white shadow-[0_2px_14px_rgba(80,100,180,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-[rgba(148,162,218,0.1)]">
                  {["Date", "Day type", "Sleep", "HRV", "Steps", "Reflection"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ea8c4]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.history].reverse().map((row, i) => (
                  <tr
                    key={row.date}
                    className={`border-b border-[rgba(148,162,218,0.08)] last:border-0 ${
                      i % 2 === 0 ? "bg-white" : "bg-[#fafbff]"
                    }`}
                  >
                    <td className="px-4 py-3 text-[12.5px] text-[#63708f]">{fmtDay(row.date)}</td>
                    <td className="px-4 py-3">
                      <DayTypePill type={row.dayType} />
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#1b2040]">{fmtSleep(row.sleepMinutes)}</td>
                    <td className="px-4 py-3 text-[13px] text-[#1b2040]">
                      {row.hrv !== null ? `${row.hrv.toFixed(1)} ms` : "—"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#1b2040]">
                      {row.steps !== null ? row.steps.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.reflection ? (
                        <div>
                          <span className={`text-[12px] font-semibold ${ACCURACY_STYLE[row.reflection.accuracy]?.color ?? "text-[#63708f]"}`}>
                            {ACCURACY_STYLE[row.reflection.accuracy]?.label ?? row.reflection.accuracy}
                          </span>
                          <span className="mx-1 text-[#9ea8c4]">·</span>
                          <span className="text-[12px] text-[#63708f]">
                            {OUTCOME_STYLE[row.reflection.outcome]?.label ?? row.reflection.outcome}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#9ea8c4]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
