"use client";

import { AppIcon } from "@/components/AppIcon";
import { useState, useEffect } from "react";
import type { ReflectionAccuracy, ReflectionOutcome, ReflectionData } from "@/app/api/reflection/route";

// ─── Option configs ────────────────────────────────────────────────────────────

const ACCURACY_OPTIONS: {
  value: ReflectionAccuracy;
  label: string;
  sub: string;
  bg: string;
  activeBg: string;
  activeText: string;
  activeBorder: string;
}[] = [
  {
    value: "yes",
    label: "Yes, spot on",
    sub: "The recommendation matched how I felt",
    bg: "bg-[#f9faff]",
    activeBg: "bg-[#ecfaf6]",
    activeText: "text-[#009e83]",
    activeBorder: "border-[rgba(0,158,131,0.35)]",
  },
  {
    value: "somewhat",
    label: "Somewhat",
    sub: "Close but not quite right",
    bg: "bg-[#f9faff]",
    activeBg: "bg-[#fffbf0]",
    activeText: "text-[#c87a36]",
    activeBorder: "border-[rgba(200,122,54,0.35)]",
  },
  {
    value: "no",
    label: "Not really",
    sub: "The day felt different from what was suggested",
    bg: "bg-[#f9faff]",
    activeBg: "bg-[#fff3f0]",
    activeText: "text-[#e05f3c]",
    activeBorder: "border-[rgba(224,95,60,0.35)]",
  },
];

const OUTCOME_OPTIONS: {
  value: ReflectionOutcome;
  label: string;
  sub: string;
  icon: "star" | "check" | "skip" | "sleep";
  iconColor: string;
  activeBg: string;
  activeText: string;
  activeBorder: string;
}[] = [
  {
    value: "great",
    label: "Great session",
    sub: "Felt strong, hit targets",
    icon: "star",
    iconColor: "text-[#f6a235]",
    activeBg: "bg-[#fff8f0]",
    activeText: "text-[#c87a36]",
    activeBorder: "border-[rgba(246,162,53,0.35)]",
  },
  {
    value: "good",
    label: "Good enough",
    sub: "Got it done, felt okay",
    icon: "check",
    iconColor: "text-[#009e83]",
    activeBg: "bg-[#ecfaf6]",
    activeText: "text-[#009e83]",
    activeBorder: "border-[rgba(0,158,131,0.35)]",
  },
  {
    value: "skipped",
    label: "Skipped training",
    sub: "Didn't train / worked instead",
    icon: "skip",
    iconColor: "text-[#9ea8c4]",
    activeBg: "bg-[#f4f5fb]",
    activeText: "text-[#63708f]",
    activeBorder: "border-[rgba(148,162,218,0.4)]",
  },
  {
    value: "rest",
    label: "Full rest day",
    sub: "Intentional recovery",
    icon: "sleep",
    iconColor: "text-[#4a7df6]",
    activeBg: "bg-[#eef3ff]",
    activeText: "text-[#4a7df6]",
    activeBorder: "border-[rgba(74,125,246,0.35)]",
  },
];

// ─── Main component ────────────────────────────────────────────────────────────

interface ReflectionViewProps {
  date: string;
  dateLabel: string;
  dayTypeLabel: string;
}

type Phase = "loading" | "idle" | "submitting" | "done" | "error";

export default function ReflectionView({
  date,
  dateLabel,
  dayTypeLabel,
}: ReflectionViewProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [accuracy, setAccuracy] = useState<ReflectionAccuracy | null>(null);
  const [outcome, setOutcome] = useState<ReflectionOutcome | null>(null);
  const [note, setNote] = useState("");
  const [existing, setExisting] = useState<ReflectionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load any existing reflection for today
  useEffect(() => {
    fetch(`/api/reflection?date=${date}`)
      .then((r) => r.json() as Promise<ReflectionData | null>)
      .then((data) => {
        if (data) {
          setExisting(data);
          setAccuracy(data.accuracy);
          setOutcome(data.outcome);
          setNote(data.note ?? "");
          setPhase("done");
        } else {
          setPhase("idle");
        }
      })
      .catch(() => setPhase("idle"));
  }, [date]);

  async function handleSubmit() {
    if (!accuracy || !outcome) return;
    setPhase("submitting");
    setError(null);

    try {
      const res = await fetch("/api/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, accuracy, outcome, note: note || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setExisting({ date, accuracy, outcome, note: note || null });
      setPhase("done");
    } catch {
      setError("Couldn't save your reflection. Try again.");
      setPhase("idle");
    }
  }

  function handleEdit() {
    setPhase("idle");
  }

  const canSubmit = !!accuracy && !!outcome;

  // ── Loading ────────────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <svg className="h-5 w-5 animate-spin text-[#4a7df6]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  // ── Done / summary state ───────────────────────────────────────────────────

  if (phase === "done" && existing) {
    const acc = ACCURACY_OPTIONS.find((o) => o.value === existing.accuracy)!;
    const out = OUTCOME_OPTIONS.find((o) => o.value === existing.outcome)!;

    return (
      <div className="mx-auto max-w-lg space-y-5">
        {/* Success header */}
        <div className="flex items-center gap-3 rounded-[18px] border border-[rgba(0,158,131,0.2)] bg-[#ecfaf6] p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
            <AppIcon name="reflect" size={20} className="text-[#009e83]" />
          </div>
          <div>
            <p className="font-[family-name:var(--font-display)] text-[15px] font-bold text-[#1b2040]">
              Reflection saved
            </p>
            <p className="text-[12.5px] text-[#63708f]">{dateLabel}</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
          <p className="mb-4 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[#9ea8c4]">
            Tonight&apos;s reflection
          </p>

          <div className="space-y-3">
            {/* Accuracy */}
            <div className={`flex items-start gap-3 rounded-[12px] border p-4 ${acc.activeBg} ${acc.activeBorder}`}>
              <AppIcon name="reflect" size={16} className={`mt-px shrink-0 ${acc.activeText}`} />
              <div>
                <p className={`text-[12px] font-semibold uppercase tracking-[0.1em] ${acc.activeText}`}>
                  Recommendation accuracy
                </p>
                <p className="mt-0.5 text-[14px] font-semibold text-[#1b2040]">{acc.label}</p>
                <p className="text-[12.5px] text-[#63708f]">{acc.sub}</p>
              </div>
            </div>

            {/* Outcome */}
            <div className={`flex items-start gap-3 rounded-[12px] border p-4 ${out.activeBg} ${out.activeBorder}`}>
              <AppIcon name={out.icon} size={16} className={`mt-px shrink-0 ${out.activeText}`} />
              <div>
                <p className={`text-[12px] font-semibold uppercase tracking-[0.1em] ${out.activeText}`}>
                  How the day went
                </p>
                <p className="mt-0.5 text-[14px] font-semibold text-[#1b2040]">{out.label}</p>
                <p className="text-[12.5px] text-[#63708f]">{out.sub}</p>
              </div>
            </div>

            {/* Note */}
            {existing.note && (
              <div className="rounded-[12px] border border-[rgba(148,162,218,0.14)] bg-[#f9faff] p-4">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ea8c4]">Note</p>
                <p className="text-[13.5px] text-[#1b2040]">{existing.note}</p>
              </div>
            )}
          </div>

          <button
            onClick={handleEdit}
            className="mt-4 text-[12px] text-[#4a7df6] hover:underline"
          >
            Edit reflection
          </button>
        </div>
      </div>
    );
  }

  // ── Form state ─────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold text-[#1b2040]">
          Night Reflection
        </h2>
        <p className="mt-1 text-[13.5px] text-[#63708f]">
          {dateLabel} · {dayTypeLabel} was recommended
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 rounded-[12px] border border-[rgba(74,125,246,0.2)] bg-[#eef3ff] px-4 py-3">
        <AppIcon name="info" size={14} className="mt-px shrink-0 text-[#4a7df6]" />
        <p className="text-[12.5px] text-[#1e3a8a]">
          Your answers help FitAI learn your personal patterns over time.
        </p>
      </div>

      {/* Q1: Accuracy */}
      <div>
        <p className="mb-3 text-[13px] font-semibold text-[#1b2040]">
          Was today&apos;s recommendation accurate?
        </p>
        <div className="space-y-2">
          {ACCURACY_OPTIONS.map((opt) => {
            const isActive = accuracy === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setAccuracy(opt.value)}
                className={`flex w-full items-center gap-3 rounded-[12px] border p-4 text-left transition ${
                  isActive
                    ? `${opt.activeBg} ${opt.activeBorder} ${opt.activeText}`
                    : "border-[rgba(148,162,218,0.2)] bg-[#f9faff] text-[#63708f] hover:border-[rgba(148,162,218,0.4)] hover:bg-white"
                }`}
              >
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    isActive ? "border-current bg-current" : "border-[#9ea8c4]"
                  }`}
                >
                  {isActive && (
                    <span className="block h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-[13.5px] font-semibold ${isActive ? "text-[#1b2040]" : "text-[#1b2040]"}`}>
                    {opt.label}
                  </p>
                  <p className="text-[12px] text-[#63708f]">{opt.sub}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Q2: Outcome */}
      <div>
        <p className="mb-3 text-[13px] font-semibold text-[#1b2040]">
          How did training / your day actually go?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {OUTCOME_OPTIONS.map((opt) => {
            const isActive = outcome === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setOutcome(opt.value)}
                className={`flex flex-col items-start gap-2 rounded-[12px] border p-4 text-left transition ${
                  isActive
                    ? `${opt.activeBg} ${opt.activeBorder}`
                    : "border-[rgba(148,162,218,0.2)] bg-[#f9faff] hover:border-[rgba(148,162,218,0.4)] hover:bg-white"
                }`}
              >
                <AppIcon
                  name={opt.icon}
                  size={18}
                  className={isActive ? opt.activeText : "text-[#9ea8c4]"}
                />
                <div>
                  <p className={`text-[13px] font-semibold ${isActive ? opt.activeText : "text-[#1b2040]"}`}>
                    {opt.label}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-[#63708f]">{opt.sub}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional note */}
      <div>
        <p className="mb-2 text-[13px] font-semibold text-[#1b2040]">
          Anything else? <span className="font-normal text-[#9ea8c4]">(optional)</span>
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. legs felt heavy, stress was higher than expected…"
          rows={3}
          className="w-full resize-none rounded-[12px] border border-[rgba(148,162,218,0.3)] bg-white px-4 py-3 text-[13.5px] text-[#1b2040] placeholder-[#9ea8c4] outline-none transition focus:border-[#4a7df6] focus:ring-2 focus:ring-[rgba(74,125,246,0.12)]"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-[13px] text-[#e05f3c]">{error}</p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || phase === "submitting"}
        className="w-full rounded-[14px] bg-[#4a7df6] px-4 py-3.5 text-[14px] font-semibold text-white shadow-[0_4px_12px_rgba(74,125,246,0.3)] transition hover:bg-[#3a6de0] disabled:opacity-40"
      >
        {phase === "submitting" ? "Saving…" : "Save reflection"}
      </button>
    </div>
  );
}
