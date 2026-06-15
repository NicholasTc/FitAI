"use client";

import { AppIcon } from "@/components/AppIcon";
import { useState } from "react";
import type { CheckInData } from "@/types/today";

interface SliderRowProps {
  label: string;
  sublabel?: string;
  value: number;
  onChange: (v: number) => void;
  lowLabel?: string;
  highLabel?: string;
  color?: string;
}

// Thumb diameter in px — large enough for comfortable touch
const THUMB = 28;

function SliderRow({
  label,
  sublabel,
  value,
  onChange,
  lowLabel = "Low",
  highLabel = "High",
  color = "#4a7df6",
}: SliderRowProps) {
  const pct = ((value - 1) / 9) * 100;
  // Position thumb center at pct% of the track.
  // Formula: left = pct% - (pct/100 * thumbWidth) keeps the thumb fully inside at 0 and 100.
  const thumbLeft = `calc(${pct}% - ${(pct / 100) * THUMB}px)`;

  return (
    <div className="py-4 [&+&]:border-t [&+&]:border-[rgba(148,162,218,0.1)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[14px] font-semibold text-[#1b2040]">{label}</p>
          {sublabel && <p className="mt-0.5 text-[12px] text-[#9ea8c4]">{sublabel}</p>}
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-bold"
          style={{ background: `${color}18`, color }}
        >
          {value}
        </div>
      </div>

      {/* Slider — fixed height container so track and thumb stack correctly */}
      <div className="relative" style={{ height: THUMB }}>
        {/* Track sits vertically centred */}
        <div
          className="absolute inset-x-0 rounded-full bg-[#eef0f8]"
          style={{ top: "50%", height: 6, transform: "translateY(-50%)" }}
        >
          {/* Filled portion */}
          <div
            className="h-full rounded-full transition-[width] duration-100"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>

        {/* Visible thumb — centred on the fill position */}
        <div
          className="pointer-events-none absolute rounded-full border-[3px] border-white shadow-[0_2px_10px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.06)] transition-[left] duration-100"
          style={{
            width: THUMB,
            height: THUMB,
            top: "50%",
            transform: "translateY(-50%)",
            left: thumbLeft,
            background: color,
          }}
        />

        {/* Native range — fills the entire hit area, transparent */}
        <input
          type="range"
          min={1}
          max={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      {/* Labels */}
      <div className="mt-1 flex justify-between text-[11px] text-[#9ea8c4]">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

interface CheckInViewProps {
  date: string;           // YYYY-MM-DD
  dateLabel: string;      // "Tuesday, June 9"
  existing: CheckInData | null;
  onComplete: () => void;
}

export default function CheckInView({
  date,
  dateLabel,
  existing,
  onComplete,
}: CheckInViewProps) {
  const [energy, setEnergy] = useState(existing?.energyLevel ?? 6);
  const [stress, setStress] = useState(existing?.stressLevel ?? 4);
  const [sleepQ, setSleepQ] = useState(existing?.sleepQuality ?? 7);
  const [motivation, setMotivation] = useState(existing?.motivation ?? 6);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          energyLevel: energy,
          stressLevel: stress,
          sleepQuality: sleepQ,
          motivation,
        }),
      });

      if (!res.ok) throw new Error(`Failed (${res.status})`);

      setDone(true);
      setTimeout(() => {
        onComplete();
      }, 800);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ecfaf6] text-[#009e83]">
          <AppIcon name="check" size={28} />
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#1b2040]">
          Check-in saved!
        </h2>
        <p className="text-[13px] text-[#63708f]">Computing your readiness score…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Header */}
      <div className="mb-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#1b2040]">
          Morning Check-In
        </h2>
        <p className="mt-1 text-[13px] text-[#9ea8c4]">
          {dateLabel} · Takes about 30 seconds
        </p>
      </div>

      {existing && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[rgba(74,125,246,0.18)] bg-[#eef3ff] px-4 py-2.5 text-[12.5px] text-[#4a7df6]">
          <AppIcon name="info" size={16} className="shrink-0" />
          You already checked in today — you can update your responses.
        </div>
      )}

      {/* Card */}
      <div className="space-y-4">
        {/* Sleep quality */}
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
          <p className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#9ea8c4]">
            Sleep
          </p>
          <SliderRow
            label="Sleep quality"
            sublabel="How rested did you feel waking up?"
            value={sleepQ}
            onChange={setSleepQ}
            lowLabel="Awful"
            highLabel="Excellent"
            color="#4a7df6"
          />
        </div>

        {/* How you feel */}
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
          <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#9ea8c4]">
            How you feel right now
          </p>
          <SliderRow
            label="Energy level"
            value={energy}
            onChange={setEnergy}
            lowLabel="Drained"
            highLabel="Energized"
            color="#f6a235"
          />
          <SliderRow
            label="Stress level"
            sublabel="Mental pressure or anxiety"
            value={stress}
            onChange={setStress}
            lowLabel="Calm"
            highLabel="Very stressed"
            color="#e05f3c"
          />
          <SliderRow
            label="Motivation"
            sublabel="Drive to train or do deep work"
            value={motivation}
            onChange={setMotivation}
            lowLabel="None"
            highLabel="Locked in"
            color="#009e83"
          />
        </div>

        {/* Submit */}
        {submitError && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-600">
            {submitError}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-[#4a7df6] to-[#7850e2] px-6 py-3.5 text-[14px] font-semibold text-white shadow-[0_4px_16px_rgba(74,125,246,0.3)] transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Saving…
            </>
          ) : (
            "Compute today's readiness →"
          )}
        </button>

        <p className="text-center text-[11.5px] text-[#9ea8c4]">
          Your subjective feel carries more weight than wearable data when they conflict.
        </p>
      </div>
    </div>
  );
}
