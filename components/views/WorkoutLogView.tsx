"use client";

/**
 * WorkoutLogView — Phase B + Feature 4 post-workout recalculation.
 */

import { useEffect, useState } from "react";
import { computeWorkoutImpact, type WorkoutImpactResult } from "@/lib/postWorkout";
import type { HealthDetailResponse } from "@/types/healthDetail";

const TYPE_LABELS = ["Strength", "Cardio", "Mixed", "Sport", "Other"] as const;
type TypeLabel = (typeof TYPE_LABELS)[number];

interface WorkoutSession {
  id: string;
  date: string;
  typeLabel: TypeLabel;
  durationMinutes: number;
  rpe: number;
  sessionLoad: number;
}

const RPE_DESCRIPTORS: Record<number, string> = {
  1: "Very light — barely moving",
  2: "Light — easy breathing",
  3: "Moderate — comfortable",
  4: "Somewhat hard — starting to breathe hard",
  5: "Hard — you can still talk",
  6: "Hard — conversation is difficult",
  7: "Very hard — focused effort",
  8: "Very hard — pushing through",
  9: "Max effort — almost impossible",
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
  if (load < 100) return "text-[#6d766b]";
  if (load < 250) return "text-[#58c27a]";
  if (load < 450) return "text-[#b7ec4a]";
  if (load < 700) return "text-[#e8b45a]";
  return "text-[#ef5b5b]";
}

const INPUT_CLS =
  "w-full rounded-[11px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-3.5 py-2.5 text-[13px] text-[#f4f6f2] outline-none transition [color-scheme:dark] focus:border-[rgba(183,236,74,0.4)]";

interface WorkoutLogViewProps {
  embedded?: boolean;
}

export default function WorkoutLogView({ embedded = false }: WorkoutLogViewProps) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [impact, setImpact] = useState<WorkoutImpactResult | null>(null);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [feedbackSaved, setFeedbackSaved] = useState(false);

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

  useEffect(() => {
    void loadSessions();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setImpact(null);
    setFeedbackSaved(false);
    setLastSessionId(null);

    try {
      const res = await fetch("/api/workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, typeLabel, durationMinutes: duration, rpe }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save session");
      }

      const created = (await res.json()) as { session: WorkoutSession };
      setLastSessionId(created.session.id);

      let reservePct = 60;
      try {
        const detailRes = await fetch(`/api/health-detail?date=${date}`);
        if (detailRes.ok) {
          const detail = (await detailRes.json()) as HealthDetailResponse;
          reservePct = detail.reserve.reservePct;
        }
      } catch {
        /* use default */
      }

      setImpact(computeWorkoutImpact({ durationMinutes: duration, rpe }, { reservePct }));
      setSuccess("Session logged.");
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

  async function saveFeedback(patch: {
    feltDifficulty?: number;
    perceivedPerformance?: string;
  }) {
    if (!lastSessionId) return;
    try {
      await fetch("/api/workout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lastSessionId, ...patch }),
      });
      setFeedbackSaved(true);
    } catch {
      /* non-blocking */
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
    <div className={embedded ? "flex flex-col gap-3" : "screen-in mx-auto flex max-w-xl flex-col gap-3"}>
      <form onSubmit={handleSubmit} className="gcard p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[11px] border border-[rgba(183,236,74,0.25)] bg-[rgba(183,236,74,0.09)] text-[#b7ec4a]">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M6.5 6.5v11M17.5 6.5v11M4 9h2.5M17.5 9H20M4 15h2.5M17.5 15H20M6.5 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="text-[14px] font-bold text-[#f4f6f2]">Log a workout</p>
            <p className="text-[11.5px] text-[#6d766b]">Session RPE (Foster 2001) — rate the whole session, not each set.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#9aa398]">Date</label>
              <input type="date" value={date} max={TODAY} onChange={(e) => setDate(e.target.value)} required className={INPUT_CLS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#9aa398]">Type</label>
              <select value={typeLabel} onChange={(e) => setTypeLabel(e.target.value as TypeLabel)} className={INPUT_CLS}>
                {TYPE_LABELS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between text-[12px] font-medium text-[#9aa398]">
              <span>Duration</span>
              <span className="font-semibold text-[#f4f6f2]">{duration} min</span>
            </label>
            <input type="range" min={5} max={180} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full accent-[#b7ec4a]" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between text-[12px] font-medium text-[#9aa398]">
              <span>Session RPE — how hard did it feel?</span>
              <span className="font-semibold text-[#f4f6f2]">{rpe}/10</span>
            </label>
            <input type="range" min={1} max={10} step={1} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} className="w-full accent-[#b7ec4a]" />
            <p className="text-[11px] text-[#6d766b]">{RPE_DESCRIPTORS[rpe]}</p>
          </div>

          <div className="flex items-center justify-between rounded-[11px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] px-3.5 py-2.5">
            <div>
              <p className="text-[11px] text-[#6d766b]">Session load</p>
              <p className="text-[13px] font-semibold text-[#f4f6f2]">
                {rpe} × {duration} = <span className={sessionLoadColor(previewLoad)}>{previewLoad} AU</span>
              </p>
            </div>
            <span className={`text-[12px] font-semibold ${sessionLoadColor(previewLoad)}`}>{sessionLoadLabel(previewLoad)}</span>
          </div>

          {error && <p className="text-[12px] text-[#ef5b5b]">{error}</p>}
          {success && !impact && <p className="text-[12px] text-[#b7ec4a]">{success}</p>}

          <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-full border border-[rgba(183,236,74,0.4)] bg-[rgba(183,236,74,0.14)] py-3 text-[13.5px] font-bold text-[#b7ec4a] transition hover:bg-[rgba(183,236,74,0.2)] active:scale-[0.99] disabled:opacity-50">
            {submitting ? "Saving…" : "Log session"}
          </button>
        </div>
      </form>

      {impact && (
        <div className="gcard p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-bold text-[#f4f6f2]">Post-workout update</p>
              <p className="mt-1 text-[12px] text-[#9aa398]">{impact.summary}</p>
            </div>
            <button type="button" onClick={() => setImpact(null)} className="text-[11px] text-[#6d766b] hover:text-[#9aa398]">Dismiss</button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-[10px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] px-2.5 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-[#6d766b]">Stimulus</p>
              <p className="mt-0.5 text-[15px] font-bold text-[#f4f6f2]">{impact.stimulusReceived}</p>
            </div>
            <div className="rounded-[10px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] px-2.5 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-[#6d766b]">Reserve</p>
              <p className="mt-0.5 text-[15px] font-bold text-[#b7ec4a]">{impact.reserveBefore}% → {impact.reserveAfter}%</p>
            </div>
            <div className="rounded-[10px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] px-2.5 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-[#6d766b]">Band</p>
              <p className="mt-0.5 text-[12px] font-bold text-[#e8b45a]">{impact.bandLabel}</p>
            </div>
          </div>

          {!feedbackSaved && lastSessionId && (
            <div className="mt-4 border-t border-[rgba(255,255,255,0.06)] pt-3">
              <p className="text-[12px] font-semibold text-[#f4f6f2]">Quick check-in (optional)</p>
              <p className="mt-1 text-[11px] text-[#6d766b]">How hard did it feel?</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[3, 5, 7, 9].map((n) => (
                  <button key={n} type="button" onClick={() => void saveFeedback({ feltDifficulty: n })} className="rounded-full border border-[rgba(255,255,255,0.1)] px-3 py-1 text-[11.5px] text-[#c8d0c2] hover:border-[rgba(183,236,74,0.35)] hover:text-[#b7ec4a]">
                    {n}/10
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-[11px] text-[#6d766b]">How did you perform?</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {([["below", "Below"], ["as_expected", "As expected"], ["above", "Above"]] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => void saveFeedback({ perceivedPerformance: value })} className="rounded-full border border-[rgba(255,255,255,0.1)] px-3 py-1 text-[11.5px] text-[#c8d0c2] hover:border-[rgba(183,236,74,0.35)] hover:text-[#b7ec4a]">
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {feedbackSaved && (
            <p className="mt-3 text-[11.5px] text-[#b7ec4a]">Thanks — saved for future personalization.</p>
          )}
        </div>
      )}

      <div className="gcard p-5">
        <p className="mb-3 text-[10.5px] font-[650] uppercase tracking-[1.4px] text-[#6d766b]">Recent sessions · 28 days</p>
        {loading ? (
          <p className="text-[12px] text-[#6d766b]">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-[12px] text-[#6d766b]">No sessions logged yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-[11px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-[#f4f6f2]">{s.typeLabel}</p>
                    <span className={`text-[11px] font-medium ${sessionLoadColor(s.sessionLoad)}`}>{sessionLoadLabel(s.sessionLoad)}</span>
                  </div>
                  <p className="text-[11.5px] text-[#6d766b]">{s.date} · {s.durationMinutes} min · RPE {s.rpe} · {s.sessionLoad} AU</p>
                </div>
                <button onClick={() => handleDelete(s.id)} disabled={deleteId === s.id} className="flex-shrink-0 rounded-lg p-1.5 text-[#6d766b] transition hover:bg-[rgba(239,91,91,0.1)] hover:text-[#ef5b5b] disabled:opacity-40" title="Delete session" aria-label="Delete session">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
