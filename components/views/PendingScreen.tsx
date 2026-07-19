"use client";

/**
 * Interim screen for tabs that are scheduled for a later redesign phase.
 * It keeps the underlying feature reachable (via the legacy dashboard) so
 * nothing is a dead end while we roll the glass-orb redesign out phase by phase.
 */
interface PendingScreenProps {
  phase: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

export default function PendingScreen({
  phase,
  title,
  description,
  actionLabel,
  onAction,
}: PendingScreenProps) {
  return (
    <div className="screen-in flex flex-col items-center px-2 pt-10 text-center">
      <div className="orb-sm h-16 w-16" />
      <span className="mt-6 rounded-full border border-[rgba(183,236,74,0.3)] bg-[rgba(183,236,74,0.07)] px-3 py-1 text-[11px] font-semibold text-[#b7ec4a]">
        {phase}
      </span>
      <h2 className="mt-3 text-[19px] font-bold text-[#f4f6f2]">{title}</h2>
      <p className="mt-2 max-w-[300px] text-[13px] leading-[1.6] text-[#9aa398]">{description}</p>
      <button
        onClick={onAction}
        className="mt-6 rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] px-5 py-3 text-[13.5px] font-semibold text-[#f4f6f2] transition active:scale-[0.98]"
      >
        {actionLabel}
      </button>
    </div>
  );
}
