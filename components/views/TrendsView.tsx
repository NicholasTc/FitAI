"use client";

import type { TodayState } from "@/types/today";

interface TrendsViewProps {
  data: TodayState;
}

// ─── Sparkline chart ──────────────────────────────────────────────────────────

function SparkChart({
  values,
  color,
  fillColor,
  height = 80,
}: {
  values: (number | null)[];
  color: string;
  fillColor: string;
  height?: number;
}) {
  const numbers = values.map((v) => (v !== null ? v : 0));
  const hasData = values.some((v) => v !== null);
  if (!hasData) return null;

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const range = max - min || 1;
  const w = 400;
  const h = height;
  const n = values.length;
  const step = n > 1 ? w / (n - 1) : w;

  const pts = values.map((v, i) => {
    const x = i * step;
    const y = v !== null ? h - ((v - min) / range) * (h - 10) - 5 : h;
    return { x, y, v };
  });

  const linePts = pts
    .filter((p) => p.v !== null)
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  const areaPath = [
    ...pts.filter((p) => p.v !== null).map((p) => `${p.x},${p.y}`),
    `${pts.filter((p) => p.v !== null).at(-1)!.x},${h}`,
    `${pts.find((p) => p.v !== null)!.x},${h}`,
  ].join(" ");

  const last = pts.filter((p) => p.v !== null).at(-1);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillColor} stopOpacity="0.4" />
          <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={areaPath}
        fill={`url(#fill-${color.replace("#", "")})`}
      />
      <polyline
        points={linePts}
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last && (
        <circle cx={last.x} cy={last.y} r="4" fill={color} stroke="white" strokeWidth="2" />
      )}
    </svg>
  );
}

// ─── Metric trend card ────────────────────────────────────────────────────────

interface TrendCardProps {
  icon: string;
  label: string;
  current: string;
  avg: string;
  values: (number | null)[];
  dates: string[];
  color: string;
  fillColor: string;
  note?: string;
}

function TrendCard({
  icon,
  label,
  current,
  avg,
  values,
  dates,
  color,
  fillColor,
  note,
}: TrendCardProps) {
  const hasData = values.some((v) => v !== null);

  return (
    <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-[20px]">{icon}</span>
          <div>
            <p className="text-[13.5px] font-semibold text-[#1b2040]">{label}</p>
            <p className="text-[11.5px] text-[#9ea8c4]">7-day trend</p>
          </div>
        </div>
        <div className="text-right">
          <p
            className="font-[family-name:var(--font-display)] text-[22px] font-bold leading-none"
            style={{ color }}
          >
            {current}
          </p>
          <p className="mt-0.5 text-[11px] text-[#9ea8c4]">avg {avg}</p>
        </div>
      </div>

      {/* Chart */}
      {hasData ? (
        <>
          <SparkChart values={values} color={color} fillColor={fillColor} />
          {/* Date labels */}
          <div className="mt-2 flex justify-between">
            {dates.map((d, i) => (
              <span
                key={i}
                className={`text-[10px] ${i === dates.length - 1 ? "font-semibold" : "text-[#9ea8c4]"}`}
                style={i === dates.length - 1 ? { color } : undefined}
              >
                {i === dates.length - 1 ? "Today" : d.slice(5).replace("-", "/")}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="flex h-[80px] items-center justify-center text-[12px] text-[#9ea8c4]">
          {note ?? "No data yet"}
        </div>
      )}
    </div>
  );
}

// ─── Day type history dots ────────────────────────────────────────────────────

const DT_STYLES = {
  push: {
    bg: "#fff3f0",
    color: "#e05f3c",
    border: "rgba(224,95,60,0.25)",
    letter: "P",
  },
  maintain: {
    bg: "#ecfaf6",
    color: "#009e83",
    border: "rgba(0,158,131,0.25)",
    letter: "M",
  },
  recover: {
    bg: "#f4f0ff",
    color: "#7850e2",
    border: "rgba(120,80,226,0.25)",
    letter: "R",
  },
} as const;

// ─── Main ────────────────────────────────────────────────────────────────────

export default function TrendsView({ data }: TrendsViewProps) {
  const { history, baseline, readiness } = data;

  const dates = history.map((s) => s.date);
  const sleepVals = history.map((s) => s.sleepMinutes !== null ? s.sleepMinutes / 60 : null);
  const rhrVals = history.map((s) => s.restingHr);
  const hrvVals = history.map((s) => s.hrv);
  const stepsVals = history.map((s) => s.steps !== null ? s.steps / 1000 : null);

  const fmtSleepAvg = (m: number | null) => {
    if (m === null) return "—";
    const h = Math.floor(m / 60);
    const min = Math.round(m % 60);
    return `${h}h ${min}m`;
  };

  const avg = (vals: (number | null)[]) => {
    const ns = vals.filter((v): v is number => v !== null);
    if (!ns.length) return null;
    return ns.reduce((a, b) => a + b, 0) / ns.length;
  };

  const currentSleep = history.at(-1)?.sleepMinutes ?? null;
  const currentRhr = history.at(-1)?.restingHr ?? null;
  const currentHrv = history.at(-1)?.hrv ?? null;
  const currentSteps = history.at(-1)?.steps ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Header summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Readiness",
            value: String(readiness.score),
            color:
              readiness.dayType === "push"
                ? "#e05f3c"
                : readiness.dayType === "maintain"
                  ? "#009e83"
                  : "#7850e2",
          },
          {
            label: "Avg sleep",
            value: fmtSleepAvg(baseline.sleepMinutes),
            color: "#4a7df6",
          },
          {
            label: "Days data",
            value: `${baseline.daysWithData}/7`,
            color: "#63708f",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[14px] border border-[rgba(148,162,218,0.14)] bg-white p-4 text-center shadow-[0_2px_14px_rgba(80,100,180,0.06)]"
          >
            <p
              className="font-[family-name:var(--font-display)] text-[26px] font-bold leading-none"
              style={{ color: item.color }}
            >
              {item.value}
            </p>
            <p className="mt-1 text-[11.5px] text-[#9ea8c4]">{item.label}</p>
          </div>
        ))}
      </div>

      {/* 7-day history dots */}
      <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
        <p className="mb-4 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[#9ea8c4]">
          7-day status history
        </p>
        <div className="flex items-end justify-between gap-2">
          {history.map((day, i) => {
            const isToday = i === history.length - 1;
            const dt = isToday ? readiness.dayType : null;
            const style = dt ? DT_STYLES[dt] : null;
            const dayName = new Date(day.date + "T12:00:00").toLocaleDateString(
              "en-US",
              { weekday: "short" },
            );
            const dayDate = day.date.slice(5).replace("-", "/");

            return (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-[12px] text-[13px] font-bold transition"
                  style={
                    style
                      ? {
                          background: style.bg,
                          color: style.color,
                          border: `${isToday ? "2px" : "1.5px"} solid ${style.border}`,
                          boxShadow: isToday
                            ? `0 0 14px ${style.color}33`
                            : undefined,
                        }
                      : {
                          background: "#f4f5fb",
                          color: "#c4cad8",
                          border: "1.5px solid rgba(148,162,218,0.2)",
                        }
                  }
                >
                  {style ? style.letter : "·"}
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-medium text-[#63708f]">{dayName}</p>
                  <p className="text-[10px] text-[#9ea8c4]">{dayDate}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 border-t border-[rgba(148,162,218,0.1)] pt-3">
          {(["push", "maintain", "recover"] as const).map((dt) => (
            <div key={dt} className="flex items-center gap-2 text-[12px] text-[#63708f]">
              <div
                className="h-3 w-3 rounded-[4px]"
                style={{
                  background: DT_STYLES[dt].bg,
                  border: `1.5px solid ${DT_STYLES[dt].border}`,
                }}
              />
              {dt.charAt(0).toUpperCase() + dt.slice(1)}
            </div>
          ))}
        </div>
      </div>

      {/* Metric trend charts */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TrendCard
          icon="🌙"
          label="Sleep"
          current={currentSleep !== null ? `${(currentSleep / 60).toFixed(1)}h` : "—"}
          avg={fmtSleepAvg(baseline.sleepMinutes)}
          values={sleepVals}
          dates={dates}
          color="#4a7df6"
          fillColor="#4a7df6"
          note="Sleep data will appear once Fitbit syncs"
        />
        <TrendCard
          icon="❤️"
          label="Resting HR"
          current={currentRhr !== null ? `${Math.round(currentRhr)} bpm` : "—"}
          avg={baseline.restingHr !== null ? `${Math.round(baseline.restingHr)} bpm` : "—"}
          values={rhrVals}
          dates={dates}
          color="#e05f3c"
          fillColor="#e05f3c"
          note="Resting HR appears after a full night's sync"
        />
        <TrendCard
          icon="📈"
          label="HRV"
          current={currentHrv !== null ? `${currentHrv.toFixed(1)} ms` : "—"}
          avg={baseline.hrv !== null ? `${baseline.hrv.toFixed(1)} ms` : "—"}
          values={hrvVals}
          dates={dates}
          color="#7850e2"
          fillColor="#a98bff"
          note="HRV calibrates after a few days of Fitbit use"
        />
        <TrendCard
          icon="👣"
          label="Steps"
          current={currentSteps !== null ? `${(currentSteps / 1000).toFixed(1)}k` : "—"}
          avg={
            avg(stepsVals) !== null ? `${(avg(stepsVals)!).toFixed(1)}k steps` : "—"
          }
          values={stepsVals}
          dates={dates}
          color="#009e83"
          fillColor="#00c9a7"
        />
      </div>

      {/* Baseline status footer */}
      <div className="rounded-[14px] border border-[rgba(148,162,218,0.14)] bg-[#f9faff] px-4 py-3 text-[12.5px] text-[#63708f]">
        <span className="font-semibold text-[#1b2040]">Baseline status: </span>
        {baseline.status === "ready"
          ? `Ready — ${baseline.daysWithData} days of data. Readiness scores are fully calibrated.`
          : `Forming — ${baseline.daysWithData}/7 days. Scores improve daily as your Fitbit calibrates. Absolute thresholds are used in the meantime.`}
      </div>
    </div>
  );
}
