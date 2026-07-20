"use client";

import ReadinessOrb from "@/components/orb/ReadinessOrb";
import { computeGuardrails } from "@/lib/guardrails";
import { computeCapacity, summarizeChange, type ChangeRow } from "@/lib/homeSummary";
import { readinessCaution, readinessWord } from "@/lib/readiness";
import type { TodayState } from "@/types/today";

interface HomeViewProps {
  data: TodayState;
  onGoToCheckIn: () => void;
  onOpenHealth: () => void;
  onOpenCoach: () => void;
}

// ─── Inline icons (match proposal8 glyph set) ─────────────────────────────────

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const METRIC_ICON: Record<ChangeRow["key"], React.ReactNode> = {
  sleep: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
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
};

const METRIC_ICON_TINT: Record<ChangeRow["key"], string> = {
  sleep: "text-[#8b7cf6]",
  hrv: "text-[#58c27a]",
  rhr: "text-[#ef5b5b]",
};

function Sparkline({ row }: { row: ChangeRow }) {
  if (!row.spark || !row.sparkLast) {
    return <div className="w-[70px] shrink-0" />;
  }
  return (
    <svg width="70" height="26" viewBox="0 0 70 26" fill="none" className="shrink-0">
      <polyline
        points={row.spark}
        stroke={row.color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={row.sparkLast.x} cy={row.sparkLast.y} r="2.3" fill={row.color} />
    </svg>
  );
}

export default function HomeView({
  data,
  onGoToCheckIn,
  onOpenHealth,
  onOpenCoach,
}: HomeViewProps) {
  const { readiness, checkIn, baseline, settings, syncStatus } = data;
  const score = readiness.score;
  const word = readinessWord(score);
  const caution = readinessCaution(score);

  const change = summarizeChange(data);

  const { band } = computeGuardrails(
    readiness.dayType,
    score,
    baseline.sleepMinutes,
    {
      wakeTime: settings.wakeTime,
      deepWorkLabel: settings.deepWorkLabel,
      lightWorkLabel: settings.lightWorkLabel,
    },
  );
  const capacity = computeCapacity(band, settings.deepWorkLabel);

  const headlineTone = change.direction === "down" ? "text-[#e8b45a]" : "text-[#b7ec4a]";

  return (
    <div className="screen-in lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
      {/* Hero orb — free-floating on mobile, panelled on desktop */}
      <div className="lg:col-span-5 lg:flex lg:min-h-[400px] lg:flex-col lg:items-center lg:justify-center lg:rounded-[24px] lg:border lg:border-[rgba(255,255,255,0.06)] lg:bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.12))] lg:px-6 lg:py-4">
        <ReadinessOrb score={score} label="Readiness" status={word} caution={caution} />
      </div>

      {/* Right column (desktop) / stacked (mobile) */}
      <div className="lg:col-span-7 lg:flex lg:flex-col lg:gap-4">
        {/* Sync failure / baseline forming — kept so these states aren't lost */}
        {syncStatus && !syncStatus.ok && (
          <div className="mt-2 rounded-[16px] border border-[rgba(232,180,90,0.28)] bg-[rgba(232,180,90,0.08)] px-4 py-3 lg:mt-0">
            <p className="text-[13px] font-semibold text-[#e8b45a]">
              {syncStatus.code === "missing_scopes"
                ? "Health data not authorized"
                : syncStatus.code === "empty"
                  ? "No wearable data yet"
                  : "Health sync issue"}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#9aa398]">{syncStatus.message}</p>
          </div>
        )}
        {syncStatus?.ok && syncStatus.updating && (
          <div className="mt-2 flex items-center gap-2 rounded-[16px] border border-[rgba(183,236,74,0.2)] bg-[rgba(183,236,74,0.06)] px-4 py-3 text-[12.5px] text-[#b7ec4a] lg:mt-0">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7ec4a] border-t-transparent" />
            Updating health data…
          </div>
        )}
        {syncStatus?.ok && !syncStatus.updating && baseline.status === "forming" && (
          <div className="mt-2 flex items-center gap-2 rounded-[16px] border border-[rgba(183,236,74,0.2)] bg-[rgba(183,236,74,0.06)] px-4 py-3 text-[12.5px] text-[#b7ec4a] lg:mt-0">
            <span className="h-1.5 w-1.5 rounded-full bg-[#b7ec4a]" />
            Baseline forming — {baseline.daysWithData}/7 days. Readiness sharpens daily.
          </div>
        )}

        {/* Morning check-in nudge */}
        {!checkIn && (
          <button
            onClick={onGoToCheckIn}
            className="gcard mt-[22px] flex w-full items-center gap-[13px] p-[14px_16px] text-left transition active:scale-[0.99] hover:border-[rgba(183,236,74,0.28)] lg:mt-0"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-[rgba(183,236,74,0.25)] bg-[rgba(183,236,74,0.09)] text-[#b7ec4a]">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M4 8h10M18 8h2M4 16h2M10 16h10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                <circle cx="16" cy="8" r="2" stroke="currentColor" strokeWidth="1.9" />
                <circle cx="8" cy="16" r="2" stroke="currentColor" strokeWidth="1.9" />
              </svg>
            </span>
            <span className="flex-1">
              <span className="block text-[13.5px] font-[650] text-[#f4f6f2]">
                Complete your morning check-in
              </span>
              <span className="mt-px block text-[12px] text-[#6d766b]">
                4 sliders · under 30 seconds · personalises today&apos;s score
              </span>
            </span>
            <ChevronRight className="text-[#6d766b]" />
          </button>
        )}

        {/* What changed since yesterday */}
        <div className="gcard mt-[14px] px-[17px] pb-2 pt-4 lg:mt-0 lg:flex-1">
          <div className="k-label">What changed since yesterday</div>
          <div className="mt-2 flex items-center justify-between">
            <span className={`text-[16.5px] font-bold ${headlineTone}`}>{change.headline}</span>
            {!change.insufficient && <ChevronRight className={headlineTone} />}
          </div>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-[#9aa398]">{change.description}</p>

          {change.rows.map((row) => (
            <button
              key={row.key}
              onClick={onOpenHealth}
              className="flex w-full items-center gap-3 border-t border-[rgba(255,255,255,0.06)] py-[14px] text-left transition first-of-type:mt-1 hover:opacity-80"
            >
              <span
                className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[rgba(255,255,255,0.05)] ${METRIC_ICON_TINT[row.key]}`}
              >
                {METRIC_ICON[row.key]}
              </span>
              <span className="w-[92px] shrink-0">
                <span className="block text-[10px] font-[650] uppercase tracking-[0.8px] text-[#6d766b]">
                  {row.name}
                </span>
                {row.delta && (
                  <span
                    className={`mt-px block text-[13px] font-bold ${row.positive ? "text-[#b7ec4a]" : "text-[#ef5b5b]"}`}
                  >
                    {row.delta}
                  </span>
                )}
              </span>
              <span className="flex-1 text-[15px] font-bold text-[#f4f6f2]">{row.value}</span>
              <Sparkline row={row} />
            </button>
          ))}
        </div>
      </div>

      {/* Today's capacity — full width row on desktop */}
      <div className="lg:col-span-12">
        <div className="section-label">Today&apos;s capacity</div>
        <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
          <CapacityCard
            label="Training"
            value={capacity.training.value}
            sub={capacity.training.sub}
            icon={<DumbbellIcon />}
            onClick={onOpenCoach}
          />
          <CapacityCard
            label="Work"
            value={capacity.work.value}
            sub={capacity.work.sub}
            icon={<LaptopIcon />}
            onClick={onOpenCoach}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Capacity card (text left, icon right — matches reference layout) ─────────

function DumbbellIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LaptopIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="5.5" width="16" height="10.5" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2 19.5h20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CapacityCard({
  label,
  value,
  sub,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="gcard flex items-center justify-between gap-3 p-[16px_16px] text-left transition active:scale-[0.99] hover:border-[rgba(255,255,255,0.12)] lg:p-5"
    >
      <div className="min-w-0">
        <div className="mb-1.5 text-[10px] font-[650] uppercase tracking-[0.8px] text-[#6d766b]">
          {label}
        </div>
        <div className="text-[17px] font-bold text-[#f4f6f2] lg:text-[19px]">{value}</div>
        <div className="mt-0.5 text-[12px] text-[#9aa398]">{sub}</div>
      </div>
      <div className="shrink-0 text-[#7f8a7c]">{icon}</div>
    </button>
  );
}
