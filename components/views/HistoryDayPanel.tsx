"use client";

/**
 * HistoryDayPanel — slide-over panel for a single day's full manual record.
 *
 * Shows (in priority order):
 *   1. Reflection note + accuracy/outcome
 *   2. Morning check-in values
 *   3. Manual workout sessions
 *   4. Wearable health context (collapsed, only when stored)
 *   5. Readiness score breakdown (collapsed)
 */

import { AppIcon } from "@/components/AppIcon";
import { useEffect, useState } from "react";
import type { HistoryDayDetail, HistoryWorkout } from "@/types/history";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtSleep(min: number | null) {
  if (min === null) return "—";
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

const DAY_TYPE_STYLE = {
  push:     { bg: "bg-[#fff3f0]", text: "text-[#e05f3c]", label: "Push" },
  maintain: { bg: "bg-[#ecfaf6]", text: "text-[#009e83]", label: "Maintain" },
  recover:  { bg: "bg-[#f4f0ff]", text: "text-[#7850e2]", label: "Recover" },
};

const ACCURACY_STYLE = {
  yes:      { label: "Accurate",  color: "text-[#009e83]", bg: "bg-[#ecfaf6]" },
  somewhat: { label: "Somewhat",  color: "text-[#c87a36]", bg: "bg-[#fffbf0]" },
  no:       { label: "Not quite", color: "text-[#e05f3c]", bg: "bg-[#fff3f0]" },
};

const OUTCOME_STYLE = {
  great:   { label: "Great day" },
  good:    { label: "Good day" },
  skipped: { label: "Skipped" },
  rest:    { label: "Rest day" },
};

function sessionLoadLabel(load: number) {
  if (load < 100) return "Very low";
  if (load < 250) return "Low";
  if (load < 450) return "Moderate";
  if (load < 700) return "High";
  return "Very high";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#9ea8c4]">
      {children}
    </p>
  );
}

function SliderDisplay({ label, value }: { label: string; value: number }) {
  const pct = ((value - 1) / 9) * 100;
  const color = value >= 7 ? "#009e83" : value >= 4 ? "#e8a022" : "#e05f3c";
  return (
    <div className="flex items-center gap-3">
      <span className="w-[90px] flex-shrink-0 text-[12px] text-[#63708f]">{label}</span>
      <div className="relative h-1.5 flex-1 rounded-full bg-[#eef0f8]">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-5 text-right text-[12px] font-semibold text-[#1b2040]">{value}</span>
    </div>
  );
}

function WorkoutCard({ w, onDelete }: { w: HistoryWorkout; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/workout?id=${w.id}`, { method: "DELETE" });
      onDelete(w.id);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[rgba(148,162,218,0.12)] bg-[#f8f9ff] px-3 py-2.5">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#eef3ff]">
        <AppIcon name="workout" size={13} className="text-[#4a7df6]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-semibold text-[#1b2040]">{w.typeLabel}</p>
        <p className="text-[11px] text-[#63708f]">
          {w.durationMinutes} min · RPE {w.rpe} · {w.sessionLoad} AU ({sessionLoadLabel(w.sessionLoad)})
        </p>
      </div>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-lg p-1 text-[#9ea8c4] hover:bg-red-50 hover:text-red-400"
          title="Delete"
        >
          <AppIcon name="skip" size={13} />
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setConfirming(false)}
            className="rounded px-2 py-0.5 text-[11px] text-[#63708f] hover:bg-[#f0f2ff]"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded px-2 py-0.5 text-[11px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-[rgba(148,162,218,0.1)] pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[12px] font-semibold text-[#63708f]">{title}</span>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M3 5l4 4 4-4" stroke="#9ea8c4" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

// ─── ReflectionEditForm ───────────────────────────────────────────────────────

const ACCURACY_OPTIONS = [
  { value: "yes",      label: "Accurate" },
  { value: "somewhat", label: "Somewhat" },
  { value: "no",       label: "Not quite" },
] as const;

const OUTCOME_OPTIONS = [
  { value: "great",   label: "Great" },
  { value: "good",    label: "Good" },
  { value: "skipped", label: "Skipped" },
  { value: "rest",    label: "Rest" },
] as const;

function ReflectionEditForm({
  date,
  initial,
  onSaved,
  onCancel,
}: {
  date:     string;
  initial:  HistoryDayDetail["reflection"];
  onSaved:  (r: HistoryDayDetail["reflection"]) => void;
  onCancel: () => void;
}) {
  const [accuracy, setAccuracy] = useState<"yes" | "somewhat" | "no">(initial?.accuracy ?? "yes");
  const [outcome,  setOutcome]  = useState<"great" | "good" | "skipped" | "rest">(initial?.outcome ?? "good");
  const [note,     setNote]     = useState(initial?.note ?? "");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, accuracy, outcome, note: note.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onSaved({ accuracy, outcome, note: note.trim() || null });
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[10px] bg-[#f8f9ff] p-3">
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-[#63708f]">Was the recommendation accurate?</p>
        <div className="flex gap-2">
          {ACCURACY_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setAccuracy(o.value)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11.5px] font-medium transition-all ${
                accuracy === o.value
                  ? "bg-[#4a7df6] text-white"
                  : "bg-[#eef0f8] text-[#63708f] hover:bg-[#e2e7ff]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-[#63708f]">How did the day go?</p>
        <div className="flex gap-2">
          {OUTCOME_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setOutcome(o.value)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11.5px] font-medium transition-all ${
                outcome === o.value
                  ? "bg-[#7850e2] text-white"
                  : "bg-[#eef0f8] text-[#63708f] hover:bg-[#ede8ff]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note… (optional)"
        rows={2}
        className="w-full resize-none rounded-[8px] border border-[rgba(148,162,218,0.22)] bg-white px-3 py-2 text-[12.5px] text-[#1b2040] outline-none placeholder:text-[#b0baca] focus:border-[#4a7df6] focus:ring-2 focus:ring-[rgba(74,125,246,0.12)]"
      />
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg bg-[#eef0f8] py-2 text-[12px] font-medium text-[#63708f]"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-lg bg-[#4a7df6] py-2 text-[12px] font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface HistoryDayPanelProps {
  date:    string;
  onClose: () => void;
}

export default function HistoryDayPanel({ date, onClose }: HistoryDayPanelProps) {
  const [detail,        setDetail]        = useState<HistoryDayDetail | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [editingRefl,   setEditingRefl]   = useState(false);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setEditingRefl(false);
    fetch(`/api/history?date=${date}`)
      .then((r) => r.json() as Promise<HistoryDayDetail>)
      .then((d) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [date]);

  function handleDeleteWorkout(id: string) {
    if (!detail) return;
    setDetail({ ...detail, workouts: detail.workouts.filter((w) => w.id !== id), workoutCount: detail.workoutCount - 1 });
  }

  function handleReflectionSaved(r: HistoryDayDetail["reflection"]) {
    if (!detail) return;
    setDetail({
      ...detail,
      reflection:         r,
      hasReflection:      true,
      reflectionAccuracy: r?.accuracy ?? null,
      reflectionOutcome:  r?.outcome  ?? null,
    });
    setEditingRefl(false);
  }

  const dt = detail?.dayType ? DAY_TYPE_STYLE[detail.dayType] : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-[rgba(27,32,64,0.25)] backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-[rgba(148,162,218,0.18)] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(148,162,218,0.14)] px-5 py-4">
          <div>
            <p className="text-[12px] text-[#9ea8c4]">Day detail</p>
            <p className="text-[15px] font-bold text-[#1b2040]">{fmtDate(date)}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f4f5fb] text-[#63708f] hover:bg-[#eef0f8]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <p className="py-10 text-center text-[13px] text-[#9ea8c4]">Loading…</p>
          )}

          {!loading && detail && (
            <div className="flex flex-col gap-5">

              {/* Day type + score */}
              {(dt || detail.readinessScore !== null) && (
                <div className="flex items-center gap-2">
                  {dt && (
                    <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${dt.bg} ${dt.text}`}>
                      {dt.label} Day
                    </span>
                  )}
                  {detail.readinessScore !== null && (
                    <span className="rounded-full bg-[#f4f5fb] px-2.5 py-1 text-[12px] font-semibold text-[#63708f]">
                      Score {detail.readinessScore}
                    </span>
                  )}
                  {!dt && detail.readinessScore === null && (
                    <span className="text-[12px] text-[#9ea8c4]">Day type not recorded</span>
                  )}
                </div>
              )}

              {/* ── REFLECTION (primary) ── */}
              <div>
                <SectionLabel>Reflection</SectionLabel>
                {detail.reflection && !editingRefl ? (
                  <div className="rounded-[12px] border border-[rgba(148,162,218,0.14)] bg-[#f8f9ff] p-4">
                    <div className="mb-2 flex items-center gap-2">
                      {(() => {
                        const a = ACCURACY_STYLE[detail.reflection.accuracy];
                        const o = OUTCOME_STYLE[detail.reflection.outcome];
                        return (
                          <>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.bg} ${a.color}`}>
                              {a.label}
                            </span>
                            <span className="text-[11px] text-[#9ea8c4]">·</span>
                            <span className="text-[11.5px] text-[#63708f]">{o.label}</span>
                          </>
                        );
                      })()}
                    </div>
                    {detail.reflection.note ? (
                      <p className="text-[13px] leading-relaxed text-[#1b2040]">
                        &ldquo;{detail.reflection.note}&rdquo;
                      </p>
                    ) : (
                      <p className="text-[12px] italic text-[#9ea8c4]">No note written.</p>
                    )}
                    <button
                      onClick={() => setEditingRefl(true)}
                      className="mt-3 text-[11.5px] font-medium text-[#4a7df6] hover:underline"
                    >
                      Edit reflection
                    </button>
                  </div>
                ) : editingRefl ? (
                  <ReflectionEditForm
                    date={date}
                    initial={detail.reflection}
                    onSaved={handleReflectionSaved}
                    onCancel={() => setEditingRefl(false)}
                  />
                ) : (
                  <div className="rounded-[10px] border border-dashed border-[rgba(148,162,218,0.3)] p-3">
                    <p className="mb-2 text-[12px] text-[#9ea8c4]">No reflection logged for this day.</p>
                    <button
                      onClick={() => setEditingRefl(true)}
                      className="text-[12px] font-medium text-[#4a7df6] hover:underline"
                    >
                      + Add reflection
                    </button>
                  </div>
                )}
              </div>

              {/* ── CHECK-IN ── */}
              {detail.checkIn && (
                <div>
                  <SectionLabel>Morning check-in</SectionLabel>
                  <div className="flex flex-col gap-2 rounded-[12px] border border-[rgba(148,162,218,0.14)] bg-[#f8f9ff] px-4 py-3">
                    <SliderDisplay label="Energy"       value={detail.checkIn.energyLevel} />
                    <SliderDisplay label="Sleep quality" value={detail.checkIn.sleepQuality} />
                    <SliderDisplay label="Stress"       value={detail.checkIn.stressLevel} />
                    <SliderDisplay label="Motivation"   value={detail.checkIn.motivation} />
                  </div>
                </div>
              )}

              {/* ── WORKOUTS ── */}
              <div>
                <SectionLabel>Workouts</SectionLabel>
                {detail.workouts.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {detail.workouts.map((w) => (
                      <WorkoutCard key={w.id} w={w} onDelete={handleDeleteWorkout} />
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#9ea8c4]">No workouts logged for this day.</p>
                )}
              </div>

              {/* ── WEARABLE CONTEXT (collapsed) ── */}
              {detail.snapshot ? (
                <CollapsibleSection title="Health data (Fitbit sync)">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Sleep",    value: fmtSleep(detail.snapshot.sleepMinutes) },
                      { label: "Deep+REM", value: detail.snapshot.sleepDeepMin !== null && detail.snapshot.sleepRemMin !== null
                          ? fmtSleep((detail.snapshot.sleepDeepMin ?? 0) + (detail.snapshot.sleepRemMin ?? 0))
                          : "—" },
                      { label: "HRV",      value: detail.snapshot.hrv !== null ? `${detail.snapshot.hrv.toFixed(1)} ms` : "—" },
                      { label: "RHR",      value: detail.snapshot.restingHr !== null ? `${Math.round(detail.snapshot.restingHr)} bpm` : "—" },
                      { label: "Steps",    value: detail.snapshot.steps !== null ? detail.snapshot.steps.toLocaleString() : "—" },
                      { label: "Calories", value: detail.snapshot.totalCalories !== null ? `${Math.round(detail.snapshot.totalCalories)} kcal` : "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-[8px] bg-[#f4f5fb] px-3 py-2">
                        <p className="text-[10.5px] text-[#9ea8c4]">{label}</p>
                        <p className="text-[13px] font-semibold text-[#1b2040]">{value}</p>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              ) : (
                <CollapsibleSection title="Health data (Fitbit sync)">
                  <p className="text-[12px] text-[#9ea8c4]">
                    Wearable data was not synced for this day. Health context is only available for days when you had the app open.
                  </p>
                </CollapsibleSection>
              )}

              {/* ── SCORE AUDIT (collapsed) ── */}
              {detail.scoreAudit && (
                <CollapsibleSection title="Readiness score detail">
                  <div className="flex flex-col gap-1.5">
                    {[
                      { label: "Score",       value: String(detail.scoreAudit.score) },
                      { label: "Day type",    value: detail.scoreAudit.dayType },
                      { label: "Method",      value: detail.scoreAudit.method },
                      { label: "Data quality", value: `${Math.round(detail.scoreAudit.dataCompleteness * 100)}%` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between text-[12px]">
                        <span className="text-[#63708f]">{label}</span>
                        <span className="font-semibold text-[#1b2040]">{value}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          )}

          {!loading && !detail && (
            <p className="py-10 text-center text-[12.5px] text-[#9ea8c4]">Could not load day detail.</p>
          )}
        </div>
      </aside>
    </>
  );
}
