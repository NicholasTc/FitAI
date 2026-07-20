"use client";

import { useEffect, useState } from "react";
import { readinessWord } from "@/lib/readiness";
import type { TodayState } from "@/types/today";
import type { TrendPoint, TrendsRange, TrendsResponse } from "@/types/trends";

interface TrendsViewProps {
  data: TodayState;
}

const RANGES: { id: TrendsRange; label: string }[] = [
  { id: 7, label: "7D" },
  { id: 30, label: "30D" },
  { id: 90, label: "90D" },
];

// ─── Formatting ──────────────────────────────────────────────────────────────

function fmtSleep(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function signed(n: number, suffix: string): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n)}${suffix}`;
}

// ─── Readiness area chart ─────────────────────────────────────────────────────

function ReadinessChart({ points, range }: { points: TrendPoint[]; range: TrendsRange }) {
  const scored = points.filter((p) => p.score !== null);
  if (scored.length < 2) {
    return (
      <div className="flex h-[150px] items-center justify-center text-[12.5px] text-[#6d766b]">
        Not enough data yet for a {range}-day chart.
      </div>
    );
  }

  const W = 320;
  const H = 150;
  const padX = 6;
  const padTop = 18;
  const padBottom = 22;
  const plotH = H - padTop - padBottom;
  const n = points.length;
  const stepX = n > 1 ? (W - 2 * padX) / (n - 1) : 0;
  const yFor = (v: number) => padTop + (1 - v / 100) * plotH;

  const coords = points.map((p, i) => ({
    x: padX + i * stepX,
    y: p.score !== null ? yFor(p.score) : null,
    p,
  }));
  const linePts = coords
    .filter((c) => c.y !== null)
    .map((c) => `${c.x.toFixed(1)},${c.y!.toFixed(1)}`)
    .join(" ");
  const drawn = coords.filter((c) => c.y !== null);
  const area = `${drawn.map((c) => `${c.x.toFixed(1)},${c.y!.toFixed(1)}`).join(" ")} ${drawn.at(-1)!.x.toFixed(1)},${H - padBottom} ${drawn[0].x.toFixed(1)},${H - padBottom}`;
  const last = drawn.at(-1)!;

  const showValues = range === 7;
  const gridY = [0, 25, 50, 75, 100];

  // X-axis labels
  const labelIdx =
    range === 7
      ? points.map((_, i) => i)
      : [0, Math.floor(n / 2), n - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="readinessFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b7ec4a" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#b7ec4a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridY.map((g) => (
          <line
            key={g}
            x1={padX}
            x2={W - padX}
            y1={yFor(g)}
            y2={yFor(g)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}
        <polygon points={area} fill="url(#readinessFill)" />
        <polyline
          points={linePts}
          fill="none"
          stroke="#b7ec4a"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {drawn.map((c, i) => {
          const isLast = i === drawn.length - 1;
          return (
            <g key={i}>
              {showValues && (
                <text
                  x={c.x}
                  y={c.y! - 7}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="600"
                  fill={isLast ? "#b7ec4a" : "#9aa398"}
                >
                  {c.p.score}
                </text>
              )}
              <circle cx={c.x} cy={c.y!} r={isLast ? 3.5 : 2.4} fill={isLast ? "#b7ec4a" : "#8fd12a"} />
            </g>
          );
        })}
        {isFinite(last.x) && (
          <circle cx={last.x} cy={last.y!} r="6" fill="none" stroke="#b7ec4a" strokeOpacity="0.35" strokeWidth="2" />
        )}
      </svg>
      <div className="mt-1.5 flex justify-between px-1">
        {labelIdx.map((idx, i) => {
          const d = points[idx];
          if (!d) return <span key={i} />;
          const dt = new Date(d.date + "T12:00:00");
          const isLast = idx === n - 1;
          const label =
            range === 7
              ? dt.toLocaleDateString("en-US", { weekday: "short" })
              : dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <span
              key={i}
              className={`text-[10px] ${isLast ? "font-semibold text-[#b7ec4a]" : "text-[#6d766b]"}`}
            >
              {isLast ? "Today" : label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Metric sparkline ──────────────────────────────────────────────────────────

function MiniSpark({ values, color }: { values: (number | null)[]; color: string }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <div className="h-[34px] w-[92px]" />;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const W = 92;
  const H = 34;
  const pad = 4;
  const step = (W - 2 * pad) / (nums.length - 1);
  const coords = nums.map((v, i) => ({
    x: pad + i * step,
    y: pad + (1 - (v - min) / span) * (H - 2 * pad),
  }));
  const pts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const last = coords.at(-1)!;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" className="shrink-0">
      <polyline points={pts} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="2.4" fill={color} />
    </svg>
  );
}

// ─── Metric trend card ─────────────────────────────────────────────────────────

function MetricCard({
  icon,
  tint,
  label,
  value,
  avg,
  delta,
  deltaPositive,
  range,
  values,
  color,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: string;
  avg: string;
  delta: string | null;
  deltaPositive: boolean | null;
  range: TrendsRange;
  values: (number | null)[];
  color: string;
}) {
  return (
    <div className="gcard p-[18px_17px]">
      <div className="flex items-center gap-2">
        <span className={`${tint}`}>{icon}</span>
        <span className="text-[10px] font-[650] uppercase tracking-[1.2px] text-[#6d766b]">{label}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-[24px] font-bold leading-none text-[#f4f6f2]">{value}</div>
          {delta && (
            <div
              className={`mt-1.5 text-[12px] font-semibold ${deltaPositive ? "text-[#b7ec4a]" : deltaPositive === false ? "text-[#ef5b5b]" : "text-[#9aa398]"}`}
            >
              {delta}
              <span className="font-normal text-[#6d766b]"> vs prior {range}d</span>
            </div>
          )}
        </div>
        <div className="flex items-end gap-3">
          <div className="text-right">
            <div className="text-[9.5px] font-[650] uppercase tracking-[0.8px] text-[#6d766b]">
              {range}-day avg
            </div>
            <div className="mt-0.5 text-[15px] font-bold text-[#f4f6f2]">{avg}</div>
          </div>
          <MiniSpark values={values} color={color} />
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function TrendsView({ data }: TrendsViewProps) {
  const [range, setRange] = useState<TrendsRange>(7);
  const [trends, setTrends] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/trends?range=${range}&date=${data.date}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return res.json() as Promise<TrendsResponse>;
      })
      .then((json) => {
        if (!cancelled) {
          setTrends(json);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range, data.date]);

  const readinessScore = trends?.current.readiness ?? data.readiness.score;
  const readinessAvg = trends?.averages.readiness;

  return (
    <div className="screen-in mx-auto max-w-[820px]">
      {/* Range toggle */}
      <div className="flex gap-0.5 rounded-[12px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.045)] p-[3px]">
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            className={`flex-1 rounded-[9px] py-2 text-[12.5px] font-semibold transition ${
              range === r.id
                ? "bg-[rgba(255,255,255,0.08)] text-[#b7ec4a] shadow-[0_1px_6px_rgba(0,0,0,0.4)]"
                : "text-[#6d766b] hover:text-[#9aa398]"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-[16px] border border-[rgba(239,91,91,0.3)] bg-[rgba(239,91,91,0.08)] p-4 text-[13px] text-[#ef8b8b]">
          {error}
        </div>
      )}

      {/* Readiness chart card */}
      <div className={`gcard mt-4 p-[18px] transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="k-label">Readiness</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[30px] font-bold leading-none text-[#f4f6f2]">
                {Math.round(readinessScore)}
              </span>
              <span className="text-[13.5px] font-semibold text-[#b7ec4a]">
                {readinessWord(Math.round(readinessScore))}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="k-label">{range}-day average</div>
            <div className="mt-1 text-[20px] font-bold leading-none text-[#f4f6f2]">
              {readinessAvg !== null && readinessAvg !== undefined ? Math.round(readinessAvg) : "—"}
            </div>
            {trends?.hasPrior && trends.deltas.readiness !== null && (
              <div
                className={`mt-1 text-[11.5px] font-semibold ${trends.deltas.readiness >= 0 ? "text-[#b7ec4a]" : "text-[#ef5b5b]"}`}
              >
                {signed(Math.round(trends.deltas.readiness), "")}
                <span className="font-normal text-[#6d766b]"> vs prior {range}d</span>
              </div>
            )}
          </div>
        </div>
        <div className="mt-3">
          <ReadinessChart points={trends?.points ?? []} range={range} />
        </div>
      </div>

      {/* Metric cards */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <MetricCard
          label="Sleep duration"
          tint="text-[#8b7cf6]"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          }
          value={fmtSleep(trends?.current.sleepMinutes ?? null)}
          avg={fmtSleep(trends?.averages.sleepMinutes ?? null)}
          delta={
            trends?.hasPrior && trends.deltas.sleepMinutes !== null
              ? signed(Math.round(trends.deltas.sleepMinutes), "m")
              : null
          }
          deltaPositive={trends?.deltas.sleepMinutes != null ? trends.deltas.sleepMinutes >= 0 : null}
          range={range}
          values={(trends?.points ?? []).map((p) => p.sleepMinutes)}
          color="#8b7cf6"
        />
        <MetricCard
          label="HRV"
          tint="text-[#58c27a]"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M2 12h4l2-6 4 12 2-6h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          value={trends?.current.hrv != null ? `${Math.round(trends.current.hrv)} ms` : "—"}
          avg={trends?.averages.hrv != null ? `${Math.round(trends.averages.hrv)} ms` : "—"}
          delta={
            trends?.hasPrior && trends.deltas.hrv !== null
              ? signed(Math.round(trends.deltas.hrv), "ms")
              : null
          }
          deltaPositive={trends?.deltas.hrv != null ? trends.deltas.hrv >= 0 : null}
          range={range}
          values={(trends?.points ?? []).map((p) => p.hrv)}
          color="#58c27a"
        />
        <MetricCard
          label="Resting HR"
          tint="text-[#ef5b5b]"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 20S3.5 14.5 3.5 8.8A4.3 4.3 0 0 1 12 6a4.3 4.3 0 0 1 8.5 2.8C20.5 14.5 12 20 12 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          }
          value={trends?.current.restingHr != null ? `${Math.round(trends.current.restingHr)} bpm` : "—"}
          avg={trends?.averages.restingHr != null ? `${Math.round(trends.averages.restingHr)} bpm` : "—"}
          delta={
            trends?.hasPrior && trends.deltas.restingHr !== null
              ? signed(Math.round(trends.deltas.restingHr), " bpm")
              : null
          }
          // Lower resting HR is the improvement.
          deltaPositive={trends?.deltas.restingHr != null ? trends.deltas.restingHr <= 0 : null}
          range={range}
          values={(trends?.points ?? []).map((p) => p.restingHr)}
          color="#ef5b5b"
        />
      </div>

      {/* Insight */}
      {trends?.insight && (
        <div className="gcard mt-3 flex items-center gap-3.5 p-[16px_17px]">
          <div className="orb-sm h-11 w-11 shrink-0" />
          <div>
            <div className="k-label text-[#b7ec4a]">Insight</div>
            <p className="mt-1 text-[13px] leading-[1.5] text-[#c8d0c2]">{trends.insight}</p>
          </div>
        </div>
      )}
    </div>
  );
}
