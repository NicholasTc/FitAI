"use client";

import { AppIcon, type FitAIIconName } from "@/components/AppIcon";
import {
  hrvStatus,
  rhrStatus,
  sleepStatus,
  stepsStatus,
  type MetricText,
} from "@/lib/metricStatus";
import type { TodayState } from "@/types/today";
import {
  dayTypeColor,
  dayTypeLabel,
  readinessLabel,
  ringGradient,
} from "@/lib/readiness";
import StrategyPanel from "@/components/views/StrategyPanel";

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

interface SleepStagesBar {
  deepMin: number;
  remMin: number;
  lightMin: number;
  totalMin: number;
}

interface SignalProps {
  icon: FitAIIconName;
  iconClassName?: string;
  label: string;
  value: string;
  sub?: string;
  barPct?: number;
  barColor?: string;
  trend?: string;
  trendUp?: boolean;
  /** When set, replaces the value+bar with a status explanation */
  status?: MetricText | null;
  /** When set, replaces the single bar with a segmented sleep-stages bar */
  stagesBar?: SleepStagesBar | null;
}

function SignalCard({
  icon,
  iconClassName,
  label,
  value,
  sub,
  barPct,
  barColor,
  trend,
  trendUp,
  status,
  stagesBar,
}: SignalProps) {
  // When status text is provided, render an explanatory empty state
  if (status) {
    return (
      <div className="rounded-[16px] border border-[rgba(148,162,218,0.14)] bg-white p-4 shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
        <div className="mb-2 flex items-center gap-2">
          <AppIcon
            name={icon}
            size={18}
            className={iconClassName ?? "text-[#63708f]"}
          />
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-[#9ea8c4]">
            {label}
          </span>
        </div>
        <p
          className="font-[family-name:var(--font-display)] text-[17px] font-semibold leading-tight"
          style={{ color: status.isPending ? "#c87a36" : "#9ea8c4" }}
        >
          {status.label}
        </p>
        <p className="mt-1 text-[11.5px] leading-snug text-[#9ea8c4]">
          {status.sub}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[16px] border border-[rgba(148,162,218,0.14)] bg-white p-4 shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
      <div className="mb-2 flex items-center gap-2">
        <AppIcon
          name={icon}
          size={18}
          className={iconClassName ?? "text-[#63708f]"}
        />
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
      {barPct !== undefined && !stagesBar && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#eef0f8]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(barPct, 100)}%`, background: barColor }}
          />
        </div>
      )}
      {stagesBar && (
        <>
          {/* Segmented stages bar */}
          <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-[#eef0f8]">
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${Math.min((stagesBar.deepMin / stagesBar.totalMin) * 100, 100)}%`,
                background: "#4a7df6",
                borderRadius: "9999px 0 0 9999px",
              }}
            />
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${Math.min((stagesBar.remMin / stagesBar.totalMin) * 100, 100)}%`,
                background: "#7850e2",
              }}
            />
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${Math.min((stagesBar.lightMin / stagesBar.totalMin) * 100, 100)}%`,
                background: "#9fefdf",
                borderRadius: "0 9999px 9999px 0",
              }}
            />
          </div>
          {/* Stage labels */}
          <div className="mt-1.5 flex gap-2.5 text-[10.5px] text-[#9ea8c4]">
            <span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4a7df6] align-middle" />
              {" "}<span className="font-medium">{stagesBar.deepMin}m</span> Deep
            </span>
            <span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#7850e2] align-middle" />
              {" "}<span className="font-medium">{stagesBar.remMin}m</span> REM
            </span>
            <span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#009e83] align-middle" />
              {" "}<span className="font-medium">{stagesBar.lightMin}m</span> Light
            </span>
          </div>
        </>
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
  onGoToReflect?: () => void;
}

export default function TodayView({
  data,
  onGoToCheckIn,
  onGoToTrends,
  onGoToReflect,
}: TodayViewProps) {
  const { readiness, snapshot, baseline, checkIn, date, lastWorkout } = data;
  const dt = readiness.dayType;
  const colors = dayTypeColor(dt);
  const label = dayTypeLabel(dt);

  // ─── Metric status (explains null values)
  const sleepSt = sleepStatus(
    { sleepMinutes: snapshot.sleepMinutes, sleepDeepMin: snapshot.sleepDeepMin, sleepRemMin: snapshot.sleepRemMin },
    date,
  );
  const hrvSt = hrvStatus(
    { hrv: snapshot.hrv, sleepMinutes: snapshot.sleepMinutes, sleepDeepMin: snapshot.sleepDeepMin },
    date,
  );
  const rhrSt = rhrStatus(
    { restingHr: snapshot.restingHr, sleepMinutes: snapshot.sleepMinutes },
    date,
  );
  const stepsSt = stepsStatus({ steps: snapshot.steps }, date);

  // Hero chip: show when today has incomplete wearable data (missing HRV but baseline has it)
  const missingHrvToday = snapshot.hrv === null && baseline.hrv !== null;
  const missingRhrToday = snapshot.restingHr === null && baseline.restingHr !== null;
  const incompleteTodayData = missingHrvToday || missingRhrToday;

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
          <AppIcon name="baseline" size={18} className="shrink-0" />
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef3ff] text-[#4a7df6]">
            <AppIcon name="checkin" size={18} />
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
            {incompleteTodayData && (
              <p className="flex items-center gap-1.5 text-[12px] text-[#c87a36]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#c87a36]" />
                {missingHrvToday
                  ? "HRV not in yet — readiness uses sleep + resting HR for now."
                  : "Some metrics still pending — score will update after sync."}
              </p>
            )}
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
          {/* Sleep */}
          {(() => {
            const hasStages =
              snapshot.sleepDeepMin !== null &&
              snapshot.sleepRemMin !== null &&
              snapshot.sleepLightMin !== null &&
              snapshot.sleepMinutes !== null;
            const stages: SleepStagesBar | null = hasStages
              ? {
                  deepMin: snapshot.sleepDeepMin!,
                  remMin: snapshot.sleepRemMin!,
                  lightMin: snapshot.sleepLightMin!,
                  totalMin: snapshot.sleepMinutes!,
                }
              : null;
            return (
              <SignalCard
                icon="sleep"
                iconClassName="text-[#4a7df6]"
                label="Sleep"
                value={sleep ? `${sleep.h}h` : "—"}
                sub={sleep ? `${sleep.min}m` : undefined}
                barPct={!stages && !sleepSt ? sleepPct : undefined}
                barColor="linear-gradient(90deg,#9fefdf,#4a7df6)"
                trend={!sleepSt ? sleepTrend : undefined}
                trendUp={sleepTrendUp}
                status={snapshot.sleepMinutes === null ? sleepSt : null}
                stagesBar={stages}
              />
            );
          })()}

          {/* RHR */}
          <SignalCard
            icon="heart"
            iconClassName="text-[#e05f3c]"
            label="Resting HR"
            value={fmt(snapshot.restingHr, 0)}
            sub={snapshot.restingHr !== null ? " bpm" : undefined}
            barPct={snapshot.restingHr !== null ? Math.max(0, 100 - ((snapshot.restingHr - 40) / 60) * 100) : undefined}
            barColor="linear-gradient(90deg,#ffc6a8,#e05f3c)"
            trend={rhrTrend}
            trendUp={rhrTrendUp}
            status={rhrSt}
          />

          {/* HRV */}
          <SignalCard
            icon="hrv"
            iconClassName="text-[#7850e2]"
            label="HRV"
            value={fmt(snapshot.hrv, 1)}
            sub={snapshot.hrv !== null ? " ms" : undefined}
            barPct={snapshot.hrv !== null ? Math.min((snapshot.hrv / 120) * 100, 100) : undefined}
            barColor="linear-gradient(90deg,#a0d8ff,#4a7df6)"
            trend={hrvTrend}
            trendUp={hrvTrendUp}
            status={hrvSt}
          />

          {/* Check-in composite or Steps fallback */}
          {checkIn ? (
            <SignalCard
              icon="energy"
              iconClassName="text-[#f6a235]"
              label="Energy"
              value={`${checkIn.energyLevel}`}
              sub="/10"
              barPct={(checkIn.energyLevel / 10) * 100}
              barColor="linear-gradient(90deg,#ffd580,#f6a235)"
              trend={checkIn.stressLevel >= 7 ? "↑ High stress today" : undefined}
              trendUp={false}
            />
          ) : (
            <SignalCard
              icon="steps"
              iconClassName="text-[#009e83]"
              label="Steps"
              value={snapshot.steps !== null ? snapshot.steps.toLocaleString() : "—"}
              sub={snapshot.steps !== null && date === new Date().toLocaleDateString("en-CA") ? " so far" : undefined}
              barPct={snapshot.steps !== null ? Math.min((snapshot.steps / 10000) * 100, 100) : undefined}
              barColor="linear-gradient(90deg,#9fefdf,#009e83)"
              status={stepsSt}
            />
          )}

          {/* Last workout */}
          {lastWorkout ? (
            <SignalCard
              icon="workout"
              iconClassName="text-[#e05f3c]"
              label="Last Workout"
              value={lastWorkout.typeLabel}
              sub={undefined}
              trend={`${lastWorkout.durationMinutes}min · ${lastWorkout.date === date ? "Today" : lastWorkout.date === (() => { const d = new Date(date); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })() ? "Yesterday" : lastWorkout.date}`}
              trendUp={true}
            />
          ) : (
            <SignalCard
              icon="workout"
              iconClassName="text-[#9ea8c4]"
              label="Last Workout"
              value="—"
              status={{ label: "No recent sessions", sub: "No exercise logged in the past 7 days.", isPending: false }}
            />
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
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${s.icon}`}
                  >
                    <AppIcon name={reason.icon} size={16} />
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

            {/* Workout reason — shown when a recent session exists */}
            {lastWorkout && (() => {
              const isToday = lastWorkout.date === date;
              const yesterday = new Date(date);
              yesterday.setDate(yesterday.getDate() - 1);
              const isYesterday = lastWorkout.date === yesterday.toISOString().slice(0, 10);
              const when = isToday ? "today" : isYesterday ? "yesterday" : `on ${lastWorkout.date}`;
              const daysSince = Math.round(
                (new Date(date).getTime() - new Date(lastWorkout.date).getTime()) / 86400000,
              );
              const isRecent = daysSince <= 1;
              const sentiment: "caution" | "neutral" = isRecent ? "caution" : "neutral";
              const s = SENTIMENT_STYLES[sentiment];
              return (
                <div className="flex items-start gap-3 rounded-[13px] border border-[rgba(148,162,218,0.1)] p-3.5">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${s.icon}`}>
                    <AppIcon name="workout" size={16} />
                  </div>
                  <div className="flex-1 text-[13px] leading-relaxed">
                    <span className="font-semibold text-[#1b2040]">
                      {lastWorkout.typeLabel} {when}
                    </span>
                    <span className="text-[#63708f]">
                      {" "}— {lastWorkout.durationMinutes}min session.
                      {isRecent
                        ? " Factor in muscle fatigue and allow time to recover."
                        : " Recovery window has passed — your body should be ready."}
                    </span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.tag}`}>
                    {s.label}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* No data fallback */}
      {readiness.reasons.length === 0 && (
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-[#f9faff] p-5 text-center text-[13px] text-[#9ea8c4]">
          <AppIcon name="baseline" size={24} className="mx-auto mb-1 text-[#9ea8c4]" />
          <p>Complete your morning check-in and sync health data for personalised insights.</p>
        </div>
      )}

      {/* AI Strategy panel */}
      <StrategyPanel
        date={date}
        dayType={readiness.dayType}
        hasCheckIn={readiness.hasCheckIn}
      />

      {/* Evening reflection nudge — show after 5pm */}
      {onGoToReflect && (() => {
        const hour = new Date().getHours();
        return hour >= 17;
      })() && (
        <button
          onClick={onGoToReflect}
          className="flex w-full items-start gap-3 rounded-[18px] border border-[rgba(120,80,226,0.2)] bg-[#f8f5ff] p-5 text-left transition hover:border-[rgba(120,80,226,0.35)] hover:bg-[#f4f0ff]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f4f0ff]">
            <AppIcon name="reflect" size={18} className="text-[#7850e2]" />
          </div>
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-[#1b2040]">
              How did today actually go?
            </p>
            <p className="mt-0.5 text-[12.5px] text-[#63708f]">
              Take 30 seconds to reflect — it helps FitAI learn your patterns.
            </p>
          </div>
          <AppIcon name="trends" size={14} className="mt-1 shrink-0 text-[#9ea8c4]" />
        </button>
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
