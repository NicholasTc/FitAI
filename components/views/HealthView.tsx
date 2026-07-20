"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildHealthMetrics,
  buildRecoverySignals,
  type HealthMetric,
  type RecoverySignal,
  type Tone,
} from "@/lib/healthView";
import type { HealthInsightRequest } from "@/app/api/health-insight/route";
import { readinessWord } from "@/lib/readiness";
import HistoryView from "@/components/views/HistoryView";
import WorkoutLogView from "@/components/views/WorkoutLogView";
import type { TodayState } from "@/types/today";
import type { TrendPoint, TrendsRange, TrendsResponse } from "@/types/trends";

interface HealthViewProps {
  data: TodayState;
}

const RANGES: { id: TrendsRange; label: string }[] = [
  { id: 7, label: "7D" },
  { id: 30, label: "30D" },
  { id: 90, label: "90D" },
];

const TONE_TEXT: Record<Tone, string> = {
  good: "text-[#b7ec4a]",
  warn: "text-[#e8b45a]",
  neutral: "text-[#9aa398]",
};

// ─── Icons ─────────────────────────────────────────────────────────────────

const METRIC_ICON: Record<HealthMetric["key"], React.ReactNode> = {
  hrv: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M2 12h4l2-6 4 12 2-6h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  rhr: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M12 20S3.5 14.5 3.5 8.8A4.3 4.3 0 0 1 12 6a4.3 4.3 0 0 1 8.5 2.8C20.5 14.5 12 20 12 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
  sleep: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
  steps: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M7 4c1.5 0 2.5 1.2 2.5 3.2 0 2.4-1 4.3-1 6.1 0 1.3-.7 2-1.9 2S4.7 14.6 4.7 13c0-2.3.8-4 .8-5.8C5.5 5.2 5.8 4 7 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16.5 8c1.2 0 1.6 1.1 1.6 2.6 0 1.8.8 3.4.8 5.2 0 1.5-.9 2.4-2.1 2.4s-1.9-.8-1.9-2c0-1.7-1-3.4-1-5.5C14.9 9 15.3 8 16.5 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
};

const SIGNAL_ICON: Record<RecoverySignal["key"], React.ReactNode> = {
  sleepQuality: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
  recovery: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 21a9 9 0 1 0-9-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M3 12l2.5-2.5L8 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  energy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  stress: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v4l2.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// ─── Auto-scaled line chart (HRV / Resting HR) ────────────────────────────────

function LineChart({
  points,
  pick,
  color,
  range,
  unit,
}: {
  points: TrendPoint[];
  pick: (p: TrendPoint) => number | null;
  color: string;
  range: TrendsRange;
  unit: string;
}) {
  const nums = points.map(pick).filter((v): v is number => v !== null);
  if (nums.length < 2) {
    return (
      <div className="flex h-[132px] items-center justify-center text-[12.5px] text-[#6d766b]">
        Not enough data yet for a {range}-day chart.
      </div>
    );
  }

  const W = 320;
  const H = 132;
  const padX = 8;
  const padTop = 16;
  const padBottom = 20;
  const plotH = H - padTop - padBottom;

  const rawMin = Math.min(...nums);
  const rawMax = Math.max(...nums);
  const pad = (rawMax - rawMin) * 0.18 || Math.max(1, rawMax * 0.08);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const span = max - min || 1;

  const n = points.length;
  const stepX = n > 1 ? (W - 2 * padX) / (n - 1) : 0;
  const yFor = (v: number) => padTop + (1 - (v - min) / span) * plotH;

  const coords = points.map((p, i) => {
    const v = pick(p);
    return { x: padX + i * stepX, y: v !== null ? yFor(v) : null };
  });
  const drawn = coords.filter((c): c is { x: number; y: number } => c.y !== null);
  const linePts = drawn.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${linePts} ${drawn.at(-1)!.x.toFixed(1)},${H - padBottom} ${drawn[0].x.toFixed(1)},${H - padBottom}`;
  const last = drawn.at(-1)!;

  const gridLines = [max, (max + min) / 2, min];
  const labelIdx = range === 7 ? points.map((_, i) => i) : [0, Math.floor(n / 2), n - 1];
  const gradId = `fill-${color.replace("#", "")}`;

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }} preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridLines.map((g, i) => (
            <line key={i} x1={padX} x2={W - padX} y1={yFor(g)} y2={yFor(g)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          ))}
          <polygon points={area} fill={`url(#${gradId})`} />
          <polyline points={linePts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={last.x} cy={last.y} r="3.4" fill={color} />
          <circle cx={last.x} cy={last.y} r="6" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="2" />
        </svg>
        {/* y-axis extent labels */}
        <div className="pointer-events-none absolute right-1 top-1 text-[9px] font-medium text-[#6d766b]">
          {Math.round(rawMax)}{unit}
        </div>
        <div className="pointer-events-none absolute bottom-[22px] right-1 text-[9px] font-medium text-[#6d766b]">
          {Math.round(rawMin)}{unit}
        </div>
      </div>
      <div className="mt-1 flex justify-between px-1">
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
            <span key={i} className={`text-[10px] ${isLast ? "font-semibold text-[#f4f6f2]" : "text-[#6d766b]"}`}>
              {isLast ? "Today" : label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricTile({ metric }: { metric: HealthMetric }) {
  return (
    <div className="gcard p-[15px_15px]">
      <div className="flex items-center gap-1.5">
        <span className={TONE_TEXT[metric.tone]}>{METRIC_ICON[metric.key]}</span>
        <span className="text-[10px] font-[650] uppercase tracking-[1px] text-[#6d766b]">{metric.label}</span>
      </div>
      <div className="mt-2 text-[22px] font-bold leading-none text-[#f4f6f2]">{metric.value}</div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className={`text-[11.5px] font-semibold ${TONE_TEXT[metric.tone]}`}>{metric.quality}</span>
        {metric.delta && (
          <span
            className={`text-[11px] font-medium ${metric.deltaPositive ? "text-[#b7ec4a]" : metric.deltaPositive === false ? "text-[#ef5b5b]" : "text-[#6d766b]"}`}
          >
            {metric.delta}
          </span>
        )}
      </div>
    </div>
  );
}

function TrendCard({
  title,
  icon,
  color,
  metric,
  note,
  points,
  pick,
  range,
  unit,
  avg,
  periodDelta,
  periodPositive,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  metric: HealthMetric;
  note: string;
  points: TrendPoint[];
  pick: (p: TrendPoint) => number | null;
  range: TrendsRange;
  unit: string;
  avg: string;
  periodDelta: string | null;
  periodPositive: boolean | null;
}) {
  return (
    <div className="gcard p-[18px]">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span style={{ color }}>{icon}</span>
            <span className="text-[13px] font-[650] text-[#f4f6f2]">{title}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[28px] font-bold leading-none text-[#f4f6f2]">{metric.value}</span>
            {metric.delta && (
              <span
                className={`text-[12.5px] font-semibold ${metric.deltaPositive ? "text-[#b7ec4a]" : metric.deltaPositive === false ? "text-[#ef5b5b]" : "text-[#9aa398]"}`}
              >
                {metric.delta}
                <span className="font-normal text-[#6d766b]"> vs yesterday</span>
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9.5px] font-[650] uppercase tracking-[0.8px] text-[#6d766b]">{range}-day avg</div>
          <div className="mt-0.5 text-[16px] font-bold text-[#f4f6f2]">{avg}</div>
          {periodDelta && (
            <div className={`mt-0.5 text-[11px] font-semibold ${periodPositive ? "text-[#b7ec4a]" : "text-[#ef5b5b]"}`}>
              {periodDelta}
            </div>
          )}
        </div>
      </div>
      <p className={`mt-1.5 text-[12.5px] leading-[1.5] ${TONE_TEXT[metric.tone]}`}>{note}</p>
      <div className="mt-3">
        <LineChart points={points} pick={pick} color={color} range={range} unit={unit} />
      </div>
    </div>
  );
}

function SignalCard({ signal }: { signal: RecoverySignal }) {
  const pct = signal.score ?? 0;
  const ringColor =
    signal.tone === "good" ? "#b7ec4a" : signal.tone === "warn" ? "#e8b45a" : "#9aa398";
  const R = 20;
  const C = 2 * Math.PI * R;
  const dash = signal.score === null ? 0 : (pct / 100) * C;

  return (
    <div className="gcard flex items-center gap-3 p-[14px_14px]">
      <div className="relative h-[52px] w-[52px] shrink-0">
        <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
          <circle cx="26" cy="26" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
          {signal.score !== null && (
            <circle
              cx="26"
              cy="26"
              r={R}
              fill="none"
              stroke={ringColor}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`}
            />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[#7f8a7c]">
          {SIGNAL_ICON[signal.key]}
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-[650] uppercase tracking-[0.9px] text-[#6d766b]">{signal.label}</div>
        <div className="mt-0.5 text-[17px] font-bold leading-none text-[#f4f6f2]">
          {signal.score === null ? "—" : signal.score}
          {signal.score !== null && <span className="text-[11px] font-medium text-[#6d766b]">/100</span>}
        </div>
        <div className={`mt-1 text-[11px] font-semibold ${TONE_TEXT[signal.tone]}`}>{signal.quality}</div>
      </div>
    </div>
  );
}

// ─── AI Interpretation card ───────────────────────────────────────────────────

type InsightState =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "unconfigured" }
  | { status: "error"; message: string };

function AiInterpretation({ data }: { data: TodayState }) {
  const [state, setState] = useState<InsightState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  const payload = useMemo<HealthInsightRequest>(() => {
    const { readiness, snapshot, baseline, checkIn, history, date } = data;

    const priorVal = (pick: (e: TodayState["history"][number]) => number | null) => {
      const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].date >= date) continue;
        const v = pick(sorted[i]);
        if (v !== null) return v;
      }
      return null;
    };
    const yHrv = priorVal((e) => e.hrv);
    const yRhr = priorVal((e) => e.restingHr);

    return {
      readiness: readiness.score,
      readinessWord: readinessWord(Math.round(readiness.score)),
      dayType: readiness.dayType,
      sleepMinutes: snapshot.sleepMinutes,
      sleepEfficiency: snapshot.sleepEfficiency,
      deepMin: snapshot.sleepDeepMin,
      remMin: snapshot.sleepRemMin,
      hrv: snapshot.hrv,
      hrvBaseline: baseline.hrv,
      hrvDeltaVsYesterday: snapshot.hrv !== null && yHrv !== null ? snapshot.hrv - yHrv : null,
      restingHr: snapshot.restingHr,
      restingHrBaseline: baseline.restingHr,
      restingHrDeltaVsYesterday:
        snapshot.restingHr !== null && yRhr !== null ? snapshot.restingHr - yRhr : null,
      steps: snapshot.steps,
      baselineStatus: baseline.status,
      baselineDays: baseline.daysWithData,
      checkIn: checkIn
        ? {
            energy: checkIn.energyLevel,
            stress: checkIn.stressLevel,
            sleepQuality: checkIn.sleepQuality,
            motivation: checkIn.motivation,
          }
        : null,
    };
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch("/api/health-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (res.status === 503) {
          setState({ status: "unconfigured" });
          return;
        }
        if (!res.ok) {
          setState({ status: "error", message: json.error ?? `Error ${res.status}` });
          return;
        }
        setState({ status: "ready", text: json.interpretation });
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ status: "error", message: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [payload, nonce]);

  return (
    <div className="gcard mt-3 p-[16px_17px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="orb-sm h-9 w-9 shrink-0" />
          <span className="k-label text-[#b7ec4a]">AI Interpretation</span>
        </div>
        {(state.status === "ready" || state.status === "error") && (
          <button
            onClick={() => setNonce((n) => n + 1)}
            className="flex items-center gap-1 text-[11.5px] font-medium text-[#6d766b] transition hover:text-[#9aa398]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M20 11A8 8 0 1 0 18 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
        )}
      </div>

      <div className="mt-3">
        {state.status === "loading" && (
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-[rgba(255,255,255,0.06)]" />
            <div className="h-3 w-[92%] animate-pulse rounded bg-[rgba(255,255,255,0.06)]" />
            <div className="h-3 w-[70%] animate-pulse rounded bg-[rgba(255,255,255,0.06)]" />
          </div>
        )}
        {state.status === "ready" && (
          <p className="text-[13.5px] leading-[1.6] text-[#c8d0c2]">{state.text}</p>
        )}
        {state.status === "unconfigured" && (
          <p className="text-[13px] leading-[1.55] text-[#9aa398]">
            Live AI interpretation needs a Gemini API key. Add{" "}
            <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 py-0.5 text-[12px] text-[#c8d0c2]">GEMINI_API_KEY</code>{" "}
            to <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 py-0.5 text-[12px] text-[#c8d0c2]">.env.local</code> to enable it.
          </p>
        )}
        {state.status === "error" && (
          <p className="text-[13px] leading-[1.55] text-[#ef8b8b]">
            Couldn&apos;t generate an interpretation right now. {state.message}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

function noteFor(metric: HealthMetric, kind: "hrv" | "rhr"): string {
  if (kind === "hrv") {
    if (metric.tone === "good") return "Above your personal baseline and trending up — recovery looks strong.";
    if (metric.tone === "warn") return "Below your baseline — a signal to protect recovery today.";
    return "Holding close to your personal baseline.";
  }
  if (metric.tone === "good") return "Excellent resting range — your cardiovascular recovery is on track.";
  if (metric.tone === "warn") return "Elevated versus baseline — ease intensity if it persists.";
  return "Steady around your personal baseline.";
}

export default function HealthView({ data }: HealthViewProps) {
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

  const metrics = useMemo(() => buildHealthMetrics(data), [data]);
  const signals = useMemo(() => buildRecoverySignals(data), [data]);
  const hrvMetric = metrics.find((m) => m.key === "hrv")!;
  const rhrMetric = metrics.find((m) => m.key === "rhr")!;

  const points = trends?.points ?? [];
  const anyCheckIn = signals.some((s) => s.subjective && s.score !== null);

  return (
    <div className="screen-in mx-auto max-w-[900px]">
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

      {/* Top metric grid */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {metrics.map((m) => (
          <MetricTile key={m.key} metric={m} />
        ))}
      </div>

      {/* HRV + Resting HR trend cards */}
      <div className={`mt-3 grid gap-3 transition-opacity lg:grid-cols-2 ${loading ? "opacity-60" : "opacity-100"}`}>
        <TrendCard
          title="Heart Rate Variability"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M2 12h4l2-6 4 12 2-6h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          color="#58c27a"
          metric={hrvMetric}
          note={noteFor(hrvMetric, "hrv")}
          points={points}
          pick={(p) => p.hrv}
          range={range}
          unit="ms"
          avg={trends?.averages.hrv != null ? `${Math.round(trends.averages.hrv)} ms` : "—"}
          periodDelta={
            trends?.hasPrior && trends.deltas.hrv != null
              ? `${trends.deltas.hrv >= 0 ? "+" : "−"}${Math.abs(Math.round(trends.deltas.hrv))} ms vs prior ${range}d`
              : null
          }
          periodPositive={trends?.deltas.hrv != null ? trends.deltas.hrv >= 0 : null}
        />
        <TrendCard
          title="Resting Heart Rate"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 20S3.5 14.5 3.5 8.8A4.3 4.3 0 0 1 12 6a4.3 4.3 0 0 1 8.5 2.8C20.5 14.5 12 20 12 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          }
          color="#ef5b5b"
          metric={rhrMetric}
          note={noteFor(rhrMetric, "rhr")}
          points={points}
          pick={(p) => p.restingHr}
          range={range}
          unit=""
          avg={trends?.averages.restingHr != null ? `${Math.round(trends.averages.restingHr)} bpm` : "—"}
          periodDelta={
            trends?.hasPrior && trends.deltas.restingHr != null
              ? `${trends.deltas.restingHr >= 0 ? "+" : "−"}${Math.abs(Math.round(trends.deltas.restingHr))} bpm vs prior ${range}d`
              : null
          }
          // Lower resting HR is the improvement.
          periodPositive={trends?.deltas.restingHr != null ? trends.deltas.restingHr <= 0 : null}
        />
      </div>

      {/* Recovery signals */}
      <div className="section-label">Recovery signals</div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {signals.map((s) => (
          <SignalCard key={s.key} signal={s} />
        ))}
      </div>
      {!anyCheckIn && (
        <p className="mt-2 px-1 text-[11.5px] text-[#6d766b]">
          Energy &amp; Stress come from your morning check-in — complete it to fill these in.
        </p>
      )}

      {/* AI interpretation */}
      <AiInterpretation data={data} />

      {/* ── Training log: log a workout + calendar ── */}
      <div className="section-label">Log a workout</div>
      <WorkoutLogView embedded />

      <div className="section-label">Training calendar</div>
      <HistoryView embedded />
    </div>
  );
}
