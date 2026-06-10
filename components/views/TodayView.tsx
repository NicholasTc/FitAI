"use client";

import type { TodayState } from "@/types/today";
import {
  dayTypeColor,
  dayTypeLabel,
  readinessLabel,
  ringGradient,
} from "@/lib/readiness";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtSleep(m: number | null): { h: string; min: string } | null {
  if (m === null) return null;
  return { h: String(Math.floor(m / 60)), min: String(m % 60).padStart(2, "0") };
}

function fmt(v: number | null, decimals = 0, suffix = ""): string {
  if (v === null) return "—";
  return `${v.toFixed(decimals)}${suffix}`;
}

// ─── Readiness Ring ───────────────────────────────────────────────────────────

function ReadinessRing({
  score,
  dayType,
}: {
  score: number;
  dayType: "push" | "maintain" | "recover";
}) {
  const r = 52;
  const circumference = 2 * Math.PI * r; // ≈ 326.7
  const fill = (score / 100) * circumference;
  const grad = ringGradient(dayType);
  const gradId = `ring-${dayType}`;

  return (
    <div className="relative flex flex-col items-center gap-2">
      <div className="relative">
        <svg width="140" height="140" viewBox="0 0 140 140" fill="none">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={grad.start} />
              <stop offset="100%" stopColor={grad.end} />
            </linearGradient>
          </defs>
          {/* Track */}
          <circle
            cx="70"
            cy="70"
            r={r}
            stroke="#eef0f8"
            strokeWidth="10"
            fill="none"
          />
          {/* Fill */}
          <circle
            cx="70"
            cy="70"
            r={r}
            stroke={`url(#${gradId})`}
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${fill} ${circumference}`}
            strokeDashoffset="0"
            transform="rotate(-90 70 70)"
            style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        {/* Center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-[family-name:var(--font-display)] text-3xl font-bold leading-none text-[#1b2040]">
            {score}
          </span>
          <span className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wide text-[#9ea8c4]">
            Readiness
          </span>
        </div>
      </div>
      <span className="text-[12.5px] font-medium text-[#63708f]">
        {readinessLabel(score)}
      </span>
    </div>
  );
}

// ─── Signal metric card ───────────────────────────────────────────────────────

interface SignalProps {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  barPct?: number; // 0–100, optional
  barColor?: string;
  trend?: string;
  trendUp?: boolean;
}

function SignalCard({ icon, label, value, sub, barPct, barColor, trend, trendUp }: SignalProps) {
  return (
    <div className="rounded-[16px] border border-[rgba(148,162,218,0.14)] bg-white p-4 shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[18px]">{icon}</span>
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-[#9ea8c4]">
          {label}
        </span>
      </div>
      <p className="font-[family-name:var(--font-display)] text-[20px] font-bold leading-tight text-[#1b2040]">
        {value}
        {sub && (
          <span className="ml-0.5 text-[13px] font-normal text-[#9ea8c4]">
            {sub}
          </span>
        )}
      </p>
      {barPct !== undefined && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#eef0f8]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(barPct, 100)}%`, background: barColor }}
          />
        </div>
      )}
      {trend && (
        <p
          className={`mt-1.5 text-[11.5px] font-medium ${trendUp ? "text-[#009e83]" : "text-[#e05f3c]"}`}
        >
          {trend}
        </p>
      )}
    </div>
  );
}

// ─── Why panel ────────────────────────────────────────────────────────────────

const SENTIMENT_STYLES = {
  positive: {
    tag: "bg-[#ecfaf6] text-[#009e83] border border-[rgba(0,158,131,0.22)]",
    icon: "bg-[#ecfaf6] text-[#009e83]",
    label: "+Positive",
  },
  caution: {
    tag: "bg-[#fff8f0] text-[#c87a36] border border-[rgba(200,122,54,0.22)]",
    icon: "bg-[#fff8f0] text-[#c87a36]",
    label: "~Caution",
  },
  negative: {
    tag: "bg-[#fff3f0] text-[#e05f3c] border border-[rgba(224,95,60,0.22)]",
    icon: "bg-[#fff3f0] text-[#e05f3c]",
    label: "-Limit",
  },
  neutral: {
    tag: "bg-[#f4f5fb] text-[#63708f] border border-[rgba(148,162,218,0.2)]",
    icon: "bg-[#f4f5fb] text-[#63708f]",
    label: "Neutral",
  },
};

// ─── Main ────────────────────────────────────────────────────────────────────

interface TodayViewProps {
  data: TodayState;
  onGoToCheckIn: () => void;
  onGoToTrends: () => void;
}

export default function TodayView({
  data,
  onGoToCheckIn,
  onGoToTrends,
}: TodayViewProps) {
  const { readiness, snapshot, baseline, checkIn } = data;
  const dt = readiness.dayType;
  const colors = dayTypeColor(dt);
  const label = dayTypeLabel(dt);

  // ─── Hero description per day type
  const heroDesc =
    dt === "push"
      ? "Your body is ready. Go deep on your most challenging work, hit a hard training session, and make the most of today's capacity."
      : dt === "maintain"
        ? "Solid baseline. Do one focused work block, keep your workout moderate, and protect your recovery for tomorrow."
        : "Your system needs rest today. Light movement only — protect your energy and prioritize sleep tonight for a stronger tomorrow.";

  // ─── Sleep signal
  const sleep = fmtSleep(snapshot.sleepMinutes);
  const sleepPct =
    snapshot.sleepMinutes !== null
      ? Math.min((snapshot.sleepMinutes / 480) * 100, 100)
      : 0;

  let sleepTrend: string | undefined;
  let sleepTrendUp: boolean | undefined;
  if (snapshot.sleepMinutes !== null && baseline.sleepMinutes !== null) {
    const delta = snapshot.sleepMinutes - baseline.sleepMinutes;
    if (Math.abs(delta) > 10) {
      const sign = delta > 0 ? "↑ " : "↓ ";
      const absM = Math.abs(Math.round(delta));
      sleepTrend = `${sign}${absM}m vs your avg`;
      sleepTrendUp = delta > 0;
    }
  }

  // ─── HRV signal
  let hrvTrend: string | undefined;
  let hrvTrendUp: boolean | undefined;
  if (snapshot.hrv !== null && baseline.hrv !== null) {
    const delta = snapshot.hrv - baseline.hrv;
    if (Math.abs(delta) > 2) {
      const sign = delta > 0 ? "↑ " : "↓ ";
      hrvTrend = `${sign}${Math.abs(delta).toFixed(1)}ms vs avg ${baseline.hrv.toFixed(1)}ms`;
      hrvTrendUp = delta > 0;
    }
  }

  // ─── RHR signal
  let rhrTrend: string | undefined;
  let rhrTrendUp: boolean | undefined;
  if (snapshot.restingHr !== null && baseline.restingHr !== null) {
    const delta = snapshot.restingHr - baseline.restingHr;
    if (Math.abs(delta) > 2) {
      const sign = delta < 0 ? "↓ " : "↑ "; // lower RHR = better
      rhrTrend = `${sign}${Math.abs(Math.round(delta))}bpm vs avg ${Math.round(baseline.restingHr)}bpm`;
      rhrTrendUp = delta < 0; // improvement if down
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Baseline forming banner */}
      {baseline.status === "forming" && (
        <div className="flex items-center gap-3 rounded-2xl border border-[rgba(74,125,246,0.18)] bg-[#eef3ff] px-4 py-3 text-sm text-[#4a7df6]">
          <span className="text-base">📡</span>
          <div>
            <span className="font-semibold">Baseline forming</span>
            <span className="ml-1 text-[#7fa0f8]">
              {baseline.daysWithData}/7 days of data — readiness improves daily as your Fitbit calibrates.
            </span>
          </div>
        </div>
      )}

      {/* No check-in nudge */}
      {!checkIn && (
        <button
          onClick={onGoToCheckIn}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-[rgba(74,125,246,0.35)] bg-[rgba(74,125,246,0.04)] px-5 py-4 text-left transition hover:bg-[rgba(74,125,246,0.08)]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef3ff] text-[18px]">
            ✎
          </span>
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-[#4a7df6]">
              Complete your morning check-in
            </p>
            <p className="text-[12px] text-[#7fa0f8]">
              4 quick sliders — takes under 30 seconds. Personalises your readiness score.
            </p>
          </div>
          <span className="text-[#4a7df6] opacity-60">→</span>
        </button>
      )}

      {/* Hero card */}
      <div
        className="overflow-hidden rounded-[22px] border bg-white shadow-[0_8px_32px_rgba(80,100,180,0.10)]"
        style={{ borderColor: colors.border }}
      >
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
          {/* Text */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: colors.text }}
              />
              <span
                className="text-[12px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: colors.text }}
              >
                {checkIn ? "Morning check-in complete" : "Objective readiness"}
              </span>
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-[26px] font-bold leading-tight text-[#1b2040]">
              Today is a{" "}
              <em
                className="not-italic"
                style={{ color: colors.text }}
              >
                {label}.
              </em>
            </h2>
            <p className="max-w-md text-[14px] leading-relaxed text-[#63708f]">
              {heroDesc}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {!checkIn && (
                <button
                  onClick={onGoToCheckIn}
                  className="rounded-xl px-4 py-2 text-[13px] font-semibold transition"
                  style={{
                    background: colors.bg,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  Do check-in →
                </button>
              )}
              <button
                onClick={onGoToTrends}
                className="rounded-xl border border-[rgba(148,162,218,0.22)] bg-[#f4f5fb] px-4 py-2 text-[13px] font-medium text-[#63708f] transition hover:bg-[#eef0f9]"
              >
                View trends
              </button>
            </div>
          </div>

          {/* Ring */}
          <div className="flex shrink-0 justify-center">
            <ReadinessRing score={readiness.score} dayType={dt} />
          </div>
        </div>
      </div>

      {/* Key signals */}
      <div>
        <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[#9ea8c4]">
          Key signals
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Sleep */}
          <SignalCard
            icon="🌙"
            label="Sleep"
            value={sleep ? `${sleep.h}h` : "—"}
            sub={sleep ? `${sleep.min}m` : undefined}
            barPct={sleepPct}
            barColor="linear-gradient(90deg,#9fefdf,#4a7df6)"
            trend={sleepTrend}
            trendUp={sleepTrendUp}
          />

          {/* RHR */}
          <SignalCard
            icon="❤️"
            label="Resting HR"
            value={fmt(snapshot.restingHr, 0)}
            sub={snapshot.restingHr !== null ? " bpm" : undefined}
            barPct={snapshot.restingHr !== null ? Math.max(0, 100 - ((snapshot.restingHr - 40) / 60) * 100) : undefined}
            barColor="linear-gradient(90deg,#ffc6a8,#e05f3c)"
            trend={rhrTrend}
            trendUp={rhrTrendUp}
          />

          {/* HRV */}
          <SignalCard
            icon="📈"
            label="HRV"
            value={fmt(snapshot.hrv, 1)}
            sub={snapshot.hrv !== null ? " ms" : undefined}
            barPct={snapshot.hrv !== null ? Math.min((snapshot.hrv / 120) * 100, 100) : undefined}
            barColor="linear-gradient(90deg,#a0d8ff,#4a7df6)"
            trend={hrvTrend}
            trendUp={hrvTrendUp}
          />

          {/* Check-in composite */}
          {checkIn ? (
            <SignalCard
              icon="⚡"
              label="Energy"
              value={`${checkIn.energyLevel}`}
              sub="/10"
              barPct={(checkIn.energyLevel / 10) * 100}
              barColor="linear-gradient(90deg,#ffd580,#f6a235)"
              trend={checkIn.stressLevel >= 7 ? "↑ High stress today" : undefined}
              trendUp={false}
            />
          ) : (
            <div className="flex items-center justify-center rounded-[16px] border border-dashed border-[rgba(148,162,218,0.25)] bg-[#f9faff] p-4 text-center">
              <div>
                <span className="text-2xl">✎</span>
                <p className="mt-1 text-[11px] text-[#9ea8c4]">No check-in yet</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Why panel */}
      {readiness.reasons.length > 0 && (
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="font-[family-name:var(--font-display)] text-[15px] font-bold text-[#1b2040]">
              Why {label}?
            </h3>
            <span className="text-[11.5px] text-[#9ea8c4]">
              {checkIn ? "Based on check-in + health data" : "Based on health data"}
            </span>
          </div>

          <div className="space-y-3">
            {readiness.reasons.map((reason, i) => {
              const s = SENTIMENT_STYLES[reason.sentiment];
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-[13px] border border-[rgba(148,162,218,0.1)] p-3.5"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[15px] ${s.icon}`}
                  >
                    {reason.icon}
                  </div>
                  <div className="flex-1 text-[13px] leading-relaxed">
                    <span className="font-semibold text-[#1b2040]">{reason.title} </span>
                    <span className="text-[#63708f]">{reason.detail}</span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.tag}`}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No data fallback */}
      {readiness.reasons.length === 0 && (
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-[#f9faff] p-5 text-center text-[13px] text-[#9ea8c4]">
          <p className="mb-1 text-[18px]">📡</p>
          <p>Complete your morning check-in and sync health data for personalised insights.</p>
        </div>
      )}

      {/* Check-in summary (if done) */}
      {checkIn && (
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-[family-name:var(--font-display)] text-[14px] font-bold text-[#1b2040]">
              Today&apos;s check-in
            </h3>
            <button
              onClick={onGoToCheckIn}
              className="text-[12px] text-[#4a7df6] hover:underline"
            >
              Edit
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Energy", value: checkIn.energyLevel, color: "#f6a235" },
              { label: "Sleep quality", value: checkIn.sleepQuality, color: "#4a7df6" },
              { label: "Stress", value: checkIn.stressLevel, color: "#e05f3c", invert: true },
              { label: "Motivation", value: checkIn.motivation, color: "#009e83" },
            ].map((item) => (
              <div key={item.label} className="rounded-[12px] bg-[#f4f5fb] p-3">
                <p className="text-[11px] font-medium text-[#9ea8c4]">{item.label}</p>
                <p className="font-[family-name:var(--font-display)] text-xl font-bold text-[#1b2040]">
                  {item.value}
                  <span className="text-xs font-normal text-[#9ea8c4]">/10</span>
                </p>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(item.value / 10) * 100}%`,
                      background: item.color,
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
