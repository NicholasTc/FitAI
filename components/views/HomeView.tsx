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
    <div className="screen-in">
      {/* Hero orb */}
      <ReadinessOrb score={score} label="Readiness" status={word} caution={caution} />

      {/* Sync failure / baseline forming — kept so these states aren't lost */}
      {syncStatus && !syncStatus.ok && (
        <div className="mt-2 rounded-[16px] border border-[rgba(232,180,90,0.28)] bg-[rgba(232,180,90,0.08)] px-4 py-3">
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
      {syncStatus?.ok && baseline.status === "forming" && (
        <div className="mt-2 flex items-center gap-2 rounded-[16px] border border-[rgba(183,236,74,0.2)] bg-[rgba(183,236,74,0.06)] px-4 py-3 text-[12.5px] text-[#b7ec4a]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#b7ec4a]" />
          Baseline forming — {baseline.daysWithData}/7 days. Readiness sharpens daily.
        </div>
      )}

      {/* Morning check-in nudge */}
      {!checkIn && (
        <button
          onClick={onGoToCheckIn}
          className="gcard mt-[22px] flex w-full items-center gap-[13px] p-[14px_16px] text-left transition active:scale-[0.99]"
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
      <div className="gcard mt-[14px] px-[17px] pb-2 pt-4">
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
            className="flex w-full items-center gap-3 border-t border-[rgba(255,255,255,0.06)] py-[14px] text-left first-of-type:mt-1"
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

      {/* Today's capacity */}
      <div className="section-label">Today&apos;s capacity</div>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={onOpenCoach}
          className="gcard p-[16px_15px] text-left transition active:scale-[0.99]"
        >
          <div className="mb-[14px] text-[#9aa398]">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M6.5 6.5v11M17.5 6.5v11M4 9h2.5M17.5 9H20M4 15h2.5M17.5 15H20M6.5 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div className="mb-2 text-[10px] font-[650] uppercase tracking-[0.8px] text-[#6d766b]">Training</div>
          <div className="text-[17px] font-bold text-[#f4f6f2]">{capacity.training.value}</div>
          <div className="mt-0.5 text-[12px] text-[#9aa398]">{capacity.training.sub}</div>
        </button>
        <button
          onClick={onOpenCoach}
          className="gcard p-[16px_15px] text-left transition active:scale-[0.99]"
        >
          <div className="mb-[14px] text-[#9aa398]">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16v12H4zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="mb-2 text-[10px] font-[650] uppercase tracking-[0.8px] text-[#6d766b]">Work</div>
          <div className="text-[17px] font-bold text-[#f4f6f2]">{capacity.work.value}</div>
          <div className="mt-0.5 text-[12px] text-[#9aa398]">{capacity.work.sub}</div>
        </button>
      </div>
    </div>
  );
}
