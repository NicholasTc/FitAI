"use client";

/**
 * WorkoutLogView — Phase B
 *
 * Manual workout logging using the Foster (2001) session RPE method:
 *   Session Load = RPE (1–10) × Duration (minutes)
 *
 * This feeds into the training load calculation in lib/trainingLoad.ts,
 * replacing the less accurate "active minutes" proxy once sufficient sessions
 * are logged (≥3 sessions in the last 28 days).
 */

import { AppIcon } from "@/components/AppIcon";
import { useEffect, useState } from "react";

const TYPE_LABELS = ["Strength", "Cardio", "Mixed", "Sport", "Other"] as const;
type TypeLabel = (typeof TYPE_LABELS)[number];

interface WorkoutSession {
  id:              string;
  date:            string;
  typeLabel:       TypeLabel;
  durationMinutes: number;
  rpe:             number;
  sessionLoad:     number;
}

const RPE_DESCRIPTORS: Record<number, string> = {
  1:  "Very light — barely moving",
  2:  "Light — easy breathing",
  3:  "Moderate — comfortable",
  4:  "Somewhat hard — starting to breathe hard",
  5:  "Hard — you can still talk",
  6:  "Hard — conversation is difficult",
  7:  "Very hard — focused effort",
  8:  "Very hard — pushing through",
  9:  "Max effort — almost impossible",
  10: "Absolute max — can't continue",
};

const TODAY = new Date().toISOString().slice(0, 10);

function sessionLoadLabel(load: number): string {
  if (load < 100) return "Very low";
  if (load < 250) return "Low";
  if (load < 450) return "Moderate";
  if (load < 700) return "High";
  return "Very high";
}

function sessionLoadColor(load: number): string {
  if (load < 100) return "text-[#9ea8c4]";
  if (load < 250) return "text-[#2cb67d]";
  if (load < 450) return "text-[#009e83]";
  if (load < 700) return "text-[#e8a022]";
  return "text-[#e05f3c]";
}

export default function WorkoutLogView() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [date, setDate] = useState(TODAY);
  const [typeLabel, setTypeLabel] = useState<TypeLabel>("Strength");
  const [duration, setDuration] = useState(45);
  const [rpe, setRpe] = useState(6);

  async function loadSessions() {
    setLoading(true);
    try {
      const res = await fetch("/api/workout");
      if (!res.ok) throw new Error("Failed to load sessions");
      const data = (await res.json()) as { sessions: WorkoutSession[] };
      setSessions(data.sessions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadSessions(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, typeLabel, durationMinutes: duration, rpe }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to save session");
      }

      setSuccess("Session logged. Training load will update on next dashboard sync.");
      // Reset form to defaults
      setDate(TODAY);
      setTypeLabel("Strength");
      setDuration(45);
      setRpe(6);
      await loadSessions();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteId(id);
    try {
      const res = await fetch(`/api/workout?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete session");
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleteId(null);
    }
  }

  const previewLoad = rpe * duration;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">

      {/* Header explanation */}
      <div className="rounded-2xl border border-[rgba(148,162,218,0.18)] bg-white/70 p-5 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[#fff3f0]">
            <AppIcon name="workout" size={16} className="text-[#e05f3c]" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#1b2040]">Manual Workout Log</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#63708f]">
              Log your sessions using the <strong>session RPE method</strong> (Foster 2001).
              Rate how hard the overall session felt (1–10), not individual exercises.
              This feeds directly into your readiness score training load calculation.
            </p>
          </div>
        </div>
      </div>

      {/* Log form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[rgba(148,162,218,0.18)] bg-white/70 p-5 backdrop-blur-sm"
      >
        <p className="mb-4 text-[13px] font-semibold text-[#1b2040]">Log a session</p>

        <div className="flex flex-col gap-4">
          {/* Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#63708f]">Date</label>
            <input
              type="date"
              value={date}
              max={TODAY}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full rounded-[10px] border border-[rgba(148,162,218,0.22)] bg-[#f4f5fb] px-3 py-2 text-[13px] text-[#1b2040] outline-none focus:border-[#4a7df6] focus:ring-2 focus:ring-[rgba(74,125,246,0.15)]"
            />
          </div>

          {/* Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#63708f]">Type</label>
            <select
              value={typeLabel}
              onChange={(e) => setTypeLabel(e.target.value as TypeLabel)}
              className="w-full rounded-[10px] border border-[rgba(148,162,218,0.22)] bg-[#f4f5fb] px-3 py-2 text-[13px] text-[#1b2040] outline-none focus:border-[#4a7df6] focus:ring-2 focus:ring-[rgba(74,125,246,0.15)]"
            >
              {TYPE_LABELS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Duration */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between text-[12px] font-medium text-[#63708f]">
              <span>Duration</span>
              <span className="text-[#1b2040] font-semibold">{duration} min</span>
            </label>
            <input
              type="range"
              min={5} max={180} step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full accent-[#4a7df6]"
            />
            <div className="flex justify-between text-[10.5px] text-[#9ea8c4]">
              <span>5 min</span>
              <span>180 min</span>
            </div>
          </div>

          {/* RPE */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between text-[12px] font-medium text-[#63708f]">
              <span>Session RPE — how hard did it feel overall?</span>
              <span className="text-[#1b2040] font-semibold">{rpe}/10</span>
            </label>
            <input
              type="range"
              min={1} max={10} step={1}
              value={rpe}
              onChange={(e) => setRpe(Number(e.target.value))}
              className="w-full accent-[#4a7df6]"
            />
            <p className="text-[11.5px] italic text-[#9ea8c4]">{RPE_DESCRIPTORS[rpe]}</p>
          </div>

          {/* Live preview */}
          <div className="flex items-center justify-between rounded-[10px] bg-[#f4f5fb] px-4 py-3">
            <div>
              <p className="text-[11.5px] text-[#63708f]">Session load (RPE × duration)</p>
              <p className="text-[13px] font-semibold text-[#1b2040]">
                {rpe} × {duration} = <span className={sessionLoadColor(previewLoad)}>{previewLoad} AU</span>
              </p>
            </div>
            <span className={`text-[12px] font-semibold ${sessionLoadColor(previewLoad)}`}>
              {sessionLoadLabel(previewLoad)}
            </span>
          </div>

          {error && (
            <p className="text-[12px] text-red-500">{error}</p>
          )}
          {success && (
            <p className="text-[12px] text-[#2cb67d]">{success}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-[#4a7df6] to-[#7850e2] py-3 text-[13.5px] font-semibold text-white shadow-[0_4px_14px_rgba(74,125,246,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <AppIcon name="workout" size={15} className="text-white" />
            {submitting ? "Saving…" : "Log Session"}
          </button>
        </div>
      </form>

      {/* Session history */}
      <div className="rounded-2xl border border-[rgba(148,162,218,0.18)] bg-white/70 p-5 backdrop-blur-sm">
        <p className="mb-3 text-[13px] font-semibold text-[#1b2040]">Recent sessions (28 days)</p>
        {loading ? (
          <p className="text-[12px] text-[#9ea8c4]">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-[12px] text-[#9ea8c4]">No sessions logged yet. Sessions you log above will appear here and feed into your readiness score.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-[10px] border border-[rgba(148,162,218,0.12)] bg-[#f8f9ff] px-4 py-3"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[#eef3ff]">
                  <AppIcon name="workout" size={14} className="text-[#4a7df6]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-[#1b2040]">{s.typeLabel}</p>
                    <span className={`text-[11px] font-medium ${sessionLoadColor(s.sessionLoad)}`}>
                      {sessionLoadLabel(s.sessionLoad)}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[#63708f]">
                    {s.date} · {s.durationMinutes} min · RPE {s.rpe} · {s.sessionLoad} AU
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  disabled={deleteId === s.id}
                  className="flex-shrink-0 rounded-lg p-1.5 text-[#9ea8c4] transition-colors hover:bg-red-50 hover:text-red-400 disabled:opacity-40"
                  title="Delete session"
                >
                  <AppIcon name="skip" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Training load info */}
      <div className="rounded-2xl border border-[rgba(148,162,218,0.18)] bg-[#f4f5fb] px-4 py-4">
        <p className="text-[11.5px] leading-relaxed text-[#63708f]">
          <strong className="text-[#1b2040]">How this affects your readiness:</strong>{" "}
          Once you have ≥3 sessions logged in the past 28 days, your score will use the
          acute:chronic workload ratio (ACWR) based on session load instead of the
          &ldquo;active minutes&rdquo; proxy — which is more accurate at estimating fatigue and
          freshness.
        </p>
      </div>
    </div>
  );
}
