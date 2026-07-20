"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  bandGearLabel,
  bandHeroDesc,
  computeGuardrails,
  type GuardrailLevel,
  type ScoreBand,
} from "@/lib/guardrails";
import { readinessWord } from "@/lib/readiness";
import { streamChatResponse, type ChatMessage, MAX_CHAT_TURNS } from "@/components/AiChat";
import type {
  SignalImpact,
  StrategyAction,
  StrategyCacheEntry,
  StrategyResponse,
} from "@/types/strategy";
import type { TodayState } from "@/types/today";

interface CoachViewProps {
  data: TodayState;
  onGoToCheckIn: () => void;
}

type Phase = "loading" | "streaming" | "task-input" | "done" | "error" | "unconfigured";

const SEGMENTS: { id: StrategyAction; label: string }[] = [
  { id: "explain", label: "Explain" },
  { id: "adjust", label: "Plan Today" },
  { id: "protect", label: "Set up Tomorrow" },
];

// ─── Static mappings ──────────────────────────────────────────────────────────

const heroTitle: Record<ScoreBand, string> = {
  "push-peak": "You're firing on all cylinders.",
  push: "You're in a good place.",
  "maintain-high": "Solid and steady today.",
  "maintain-low": "Running on a lighter tank.",
  recover: "Your body wants a lighter day.",
  rest: "Today is for genuine rest.",
};

const adviceTitle: Record<ScoreBand, string> = {
  "push-peak": "Stack your hardest efforts.",
  push: "Go hard on one thing.",
  "maintain-high": "Make today productive.",
  "maintain-low": "One high-leverage win.",
  recover: "Keep it light today.",
  rest: "Rest is the work.",
};

const focusPanel: Record<ScoreBand, { value: string; sub: string }> = {
  "push-peak": { value: "Full send", sub: "RPE 8–9" },
  push: { value: "Hard OK", sub: "RPE 7–8" },
  "maintain-high": { value: "Moderate", sub: "RPE 6–7" },
  "maintain-low": { value: "Easy", sub: "RPE 5–6" },
  recover: { value: "Light", sub: "Walk / mobility" },
  rest: { value: "Rest", sub: "Full recovery" },
};

function impactPill(impact: SignalImpact): { cls: string; label: string } {
  switch (impact) {
    case "positive":
      return { cls: "text-[#b7ec4a] bg-[rgba(183,236,74,0.1)]", label: "Positive" };
    case "limiting":
      return { cls: "text-[#e8b45a] bg-[rgba(232,180,90,0.1)]", label: "Limiting" };
    case "neutral":
      return { cls: "text-[#6d766b] bg-[rgba(255,255,255,0.06)]", label: "Neutral" };
  }
}

const tagStyle: Record<GuardrailLevel, { cls: string; label: string }> = {
  ok: { cls: "text-[#b7ec4a] bg-[rgba(183,236,74,0.1)]", label: "Good" },
  moderate: { cls: "text-[#e8b45a] bg-[rgba(232,180,90,0.1)]", label: "Protect" },
  avoid: { cls: "text-[#ef5b5b] bg-[rgba(239,91,91,0.1)]", label: "Avoid" },
};

// ─── Shared bits ──────────────────────────────────────────────────────────────

function SparkleIcon({ size = 12, color = "#b7ec4a" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" />
    </svg>
  );
}

function Shimmer() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-full animate-pulse rounded bg-[rgba(255,255,255,0.06)]" />
      <div className="h-3 w-[92%] animate-pulse rounded bg-[rgba(255,255,255,0.06)]" />
      <div className="h-3 w-[74%] animate-pulse rounded bg-[rgba(255,255,255,0.06)]" />
    </div>
  );
}

// ─── Follow-up chat (dark) ──────────────────────────────────────────────────────

function ChatBlock({
  messages,
  streaming,
  busy,
  onSend,
}: {
  messages: ChatMessage[];
  streaming: string;
  busy: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const atLimit = messages.filter((m) => m.role === "user").length >= MAX_CHAT_TURNS;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming]);

  function submit() {
    const t = draft.trim();
    if (!t || busy || atLimit) return;
    onSend(t);
    setDraft("");
  }

  return (
    <div className="mt-4 border-t border-[rgba(255,255,255,0.06)] pt-4">
      <p className="k-label text-[#b7ec4a]">Ask a follow-up</p>
      {(messages.length > 0 || streaming) && (
        <div className="mt-3 flex flex-col gap-2.5">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-[13px] bg-[rgba(183,236,74,0.12)] px-3.5 py-2.5">
                  <p className="text-[13px] leading-relaxed text-[#e7f2d4]">{m.content}</p>
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[92%] rounded-[13px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-3.5 py-2.5">
                  <p className="text-[13px] leading-relaxed text-[#c8d0c2]">{m.content}</p>
                </div>
              </div>
            ),
          )}
          {streaming && (
            <div className="flex justify-start">
              <div className="max-w-[92%] rounded-[13px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-3.5 py-2.5">
                <p className="text-[13px] leading-relaxed text-[#c8d0c2]">
                  {streaming}
                  <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-[#b7ec4a] align-middle" />
                </p>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {atLimit ? (
        <p className="mt-3 text-center text-[11.5px] text-[#6d766b]">
          Conversation limit reached. Switch tabs and back to start fresh.
        </p>
      ) : (
        <div className="mt-3 flex items-end gap-2">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask a follow-up question…"
            disabled={busy}
            className="flex-1 resize-none overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-3.5 py-2.5 text-[13.5px] text-[#f4f6f2] placeholder-[#6d766b] outline-none transition focus:border-[rgba(183,236,74,0.4)] disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={busy || !draft.trim()}
            aria-label="Send"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] bg-[rgba(183,236,74,0.16)] text-[#b7ec4a] transition hover:bg-[rgba(183,236,74,0.24)] active:scale-95 disabled:opacity-40"
          >
            {busy ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 14L14 8L2 2V6.5L10 8L2 9.5V14Z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Task input (Plan Today) ────────────────────────────────────────────────────

function TaskInput({ onSubmit }: { onSubmit: (tasks: string[]) => void }) {
  const [items, setItems] = useState<string[]>([""]);

  function update(i: number, val: string) {
    setItems((prev) => prev.map((t, idx) => (idx === i ? val : t)));
  }
  function add() {
    if (items.length < 5) setItems((prev) => [...prev, ""]);
  }

  const clean = items.map((t) => t.trim()).filter(Boolean);

  return (
    <div>
      <p className="text-[13px] leading-[1.5] text-[#9aa398]">
        List today&apos;s planned tasks (up to 5) and I&apos;ll shape them to fit your capacity.
      </p>
      <div className="mt-3 space-y-2">
        {items.map((t, i) => (
          <input
            key={i}
            value={t}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`Task ${i + 1}`}
            className="w-full rounded-[11px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-3.5 py-2.5 text-[13.5px] text-[#f4f6f2] placeholder-[#6d766b] outline-none transition focus:border-[rgba(183,236,74,0.4)]"
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        {items.length < 5 && (
          <button onClick={add} className="text-[12.5px] font-semibold text-[#9aa398] transition hover:text-[#f4f6f2]">
            + Add task
          </button>
        )}
        <button
          onClick={() => onSubmit(clean)}
          className="ml-auto rounded-full border border-[rgba(183,236,74,0.4)] bg-[rgba(183,236,74,0.14)] px-5 py-2 text-[13px] font-bold text-[#b7ec4a] transition hover:bg-[rgba(183,236,74,0.2)]"
        >
          {clean.length === 0 ? "Skip & plan" : "Plan my day"}
        </button>
      </div>
    </div>
  );
}

// ─── Night reflection (persisted) ────────────────────────────────────────────────

type Accuracy = "yes" | "somewhat" | "no";
type Outcome = "great" | "good" | "skipped" | "rest";

function ReflectionCard({ date }: { date: string }) {
  const [accuracy, setAccuracy] = useState<Accuracy | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reflection?date=${date}`)
      .then((r) => r.json())
      .then((r) => {
        if (cancelled || !r) {
          if (!cancelled) setLoaded(true);
          return;
        }
        setAccuracy(r.accuracy);
        setOutcome(r.outcome);
        setNote(r.note ?? "");
        setSaved(true);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function save() {
    if (!accuracy || !outcome || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, accuracy, outcome, note: note.trim() || null }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const accOpts: { id: Accuracy; label: string }[] = [
    { id: "yes", label: "Yes" },
    { id: "somewhat", label: "Somewhat" },
    { id: "no", label: "No" },
  ];
  const outOpts: { id: Outcome; label: string }[] = [
    { id: "great", label: "Great" },
    { id: "good", label: "Good" },
    { id: "skipped", label: "Skipped" },
    { id: "rest", label: "Rest" },
  ];

  return (
    <div className="gcard mt-3 p-[16px_17px]">
      <div className="flex items-center gap-2.5">
        <span className="text-[#b7ec4a]">
          <SparkleIcon size={16} />
        </span>
        <span className="k-label">Night reflection</span>
        {saved && <span className="ml-auto text-[11px] font-semibold text-[#b7ec4a]">Saved</span>}
      </div>

      <div className="mt-3 text-[15px] font-bold text-[#f4f6f2]">Was today&apos;s call accurate?</div>
      <div className="mt-2.5 flex gap-2">
        {accOpts.map((o) => (
          <button
            key={o.id}
            onClick={() => {
              setAccuracy(o.id);
              setSaved(false);
            }}
            className={`flex-1 rounded-[11px] border px-1 py-2.5 text-[12.5px] font-semibold transition ${
              accuracy === o.id
                ? "border-[rgba(183,236,74,0.5)] bg-[rgba(183,236,74,0.09)] text-[#b7ec4a]"
                : "border-[rgba(255,255,255,0.1)] text-[#9aa398] hover:text-[#f4f6f2]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="mt-4 text-[15px] font-bold text-[#f4f6f2]">How did the day go?</div>
      <div className="mt-2.5 flex gap-2">
        {outOpts.map((o) => (
          <button
            key={o.id}
            onClick={() => {
              setOutcome(o.id);
              setSaved(false);
            }}
            className={`flex-1 rounded-[11px] border px-1 py-2.5 text-[12.5px] font-semibold transition ${
              outcome === o.id
                ? "border-[rgba(183,236,74,0.5)] bg-[rgba(183,236,74,0.09)] text-[#b7ec4a]"
                : "border-[rgba(255,255,255,0.1)] text-[#9aa398] hover:text-[#f4f6f2]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <textarea
        value={note}
        maxLength={300}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        placeholder="Jot down anything that stood out — energy, mood, workload, stress, or wins."
        className="mt-3 min-h-[74px] w-full resize-none rounded-[13px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] px-3.5 py-3 text-[13px] leading-[1.5] text-[#f4f6f2] placeholder-[#6d766b] outline-none transition focus:border-[rgba(183,236,74,0.4)]"
      />
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[11px] text-[#6d766b]">{note.length} / 300</span>
        <button
          onClick={save}
          disabled={!accuracy || !outcome || saving || !loaded}
          className="rounded-full border border-[rgba(183,236,74,0.4)] bg-[rgba(183,236,74,0.14)] px-6 py-2 text-[13px] font-bold text-[#b7ec4a] transition hover:bg-[rgba(183,236,74,0.2)] disabled:opacity-40"
        >
          {saving ? "Saving…" : saved ? "Update" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function CoachView({ data, onGoToCheckIn }: CoachViewProps) {
  const { readiness, checkIn, baseline, settings, date } = data;
  const score = Math.round(readiness.score);
  const word = readinessWord(score);

  const guardrails = computeGuardrails(readiness.dayType, readiness.score, baseline.sleepMinutes, {
    wakeTime: settings.wakeTime,
    deepWorkLabel: settings.deepWorkLabel,
    lightWorkLabel: settings.lightWorkLabel,
  });
  const band = guardrails.band;

  // ── Strategy state (active tab + per-tab cache) ──
  const [active, setActive] = useState<StrategyAction>("explain");
  const [phase, setPhase] = useState<Phase>("loading");
  const [streamText, setStreamText] = useState("");
  const [summary, setSummary] = useState("");
  const [strategy, setStrategy] = useState<StrategyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<string[]>([]);
  const [cache, setCache] = useState<Partial<Record<StrategyAction, StrategyCacheEntry>>>({});

  // ── Per-tab follow-up chat ──
  const [chatHistory, setChatHistory] = useState<Partial<Record<StrategyAction, ChatMessage[]>>>({});
  const [chatStreaming, setChatStreaming] = useState<Partial<Record<StrategyAction, string>>>({});
  const [chatBusy, setChatBusy] = useState(false);

  const runStrategy = useCallback(
    async (action: StrategyAction, taskList?: string[]) => {
      setPhase("loading");
      setStreamText("");
      setSummary("");
      setStrategy(null);
      setError(null);

      try {
        const response = await fetch("/api/strategy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, tasks: taskList, date }),
        });

        if (!response.ok) {
          if (response.status === 503) {
            setPhase("unconfigured");
            return;
          }
          const err = (await response.json()) as { error?: string };
          setError(err.error ?? "Failed to load strategy.");
          setPhase("error");
          return;
        }
        if (!response.body) {
          setError("No response body.");
          setPhase("error");
          return;
        }

        setPhase("streaming");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(part.slice(6)) as {
                type: string;
                text?: string;
                summary?: string;
                strategy?: StrategyResponse;
                message?: string;
              };
              if (event.type === "chunk" && event.text) {
                setStreamText((prev) => prev + event.text);
              } else if (event.type === "done" && event.strategy && event.summary !== undefined) {
                setSummary(event.summary);
                setStrategy(event.strategy);
                setCache((prev) => ({
                  ...prev,
                  [action]: { summary: event.summary!, strategy: event.strategy!, tasks: taskList },
                }));
                setPhase("done");
              } else if (event.type === "error") {
                setError(event.message ?? "An error occurred.");
                setPhase("error");
              }
            } catch {
              // skip malformed SSE line
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error.");
        setPhase("error");
      }
    },
    [date],
  );

  // Auto-run "explain" once on mount to populate the hero + signals.
  useEffect(() => {
    void runStrategy("explain");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function selectTab(action: StrategyAction) {
    if (action === active && (phase === "done" || phase === "streaming")) return;
    setActive(action);

    const cached = cache[action];
    if (cached) {
      setSummary(cached.summary);
      setStrategy(cached.strategy);
      setPhase("done");
      return;
    }
    if (action === "adjust" && tasks.length === 0) {
      setPhase("task-input");
      return;
    }
    void runStrategy(action, action === "adjust" ? tasks : undefined);
  }

  function sendChat(text: string) {
    const action = active;
    const original = cache[action]?.summary ?? summary;
    const history = [...(chatHistory[action] ?? []), { role: "user" as const, content: text }];
    setChatHistory((prev) => ({ ...prev, [action]: history }));
    setChatBusy(true);
    setChatStreaming((prev) => ({ ...prev, [action]: "" }));

    void streamChatResponse(
      { date, action, originalResponse: original, history },
      (acc) => setChatStreaming((prev) => ({ ...prev, [action]: acc })),
      (full) => {
        setChatHistory((prev) => ({
          ...prev,
          [action]: [...(prev[action] ?? []), { role: "assistant", content: full }],
        }));
        setChatStreaming((prev) => ({ ...prev, [action]: "" }));
        setChatBusy(false);
      },
      (msg) => {
        setChatHistory((prev) => ({
          ...prev,
          [action]: [...(prev[action] ?? []), { role: "assistant", content: `⚠️ ${msg}` }],
        }));
        setChatStreaming((prev) => ({ ...prev, [action]: "" }));
        setChatBusy(false);
      },
    );
  }

  // Hero body: AI explain summary once ready, else deterministic band plan.
  const explainSummary = cache.explain?.summary;
  const heroBody = explainSummary || bandHeroDesc(band, settings.deepWorkLabel);

  const chipTone =
    band === "push" || band === "push-peak"
      ? "text-[#b7ec4a] bg-[rgba(183,236,74,0.1)] border-[rgba(183,236,74,0.28)]"
      : band === "recover" || band === "rest"
        ? "text-[#ef5b5b] bg-[rgba(239,91,91,0.1)] border-[rgba(239,91,91,0.28)]"
        : "text-[#e8b45a] bg-[rgba(232,180,90,0.1)] border-[rgba(232,180,90,0.28)]";

  return (
    <div className="screen-in mx-auto max-w-[900px]">
      {/* Hero */}
      <div className="gcard flex items-center gap-4 p-[20px_18px]">
        <div className="orb-sm relative flex h-[104px] w-[104px] shrink-0 items-center justify-center">
          <div className="text-center">
            <div className="text-[8px] font-semibold uppercase tracking-[2.2px] text-[rgba(206,216,208,0.56)]">
              Readiness
            </div>
            <div className="mt-0.5 text-[30px] font-bold leading-none tracking-[-1px] text-[#f3f7f0]">{score}</div>
            <div className="mt-0.5 text-[10.5px] font-semibold text-[#a9e35c]">{word}</div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="k-label">Today&apos;s summary</div>
          <div className="mt-1.5 text-[19px] font-bold leading-[1.15] tracking-[-0.3px] text-[#b7ec4a]">
            {heroTitle[band]}
          </div>
          {phase === "loading" && !explainSummary ? (
            <div className="mt-2.5">
              <Shimmer />
            </div>
          ) : (
            <p className="mt-1.5 text-[13px] leading-[1.55] text-[#9aa398]">{heroBody}</p>
          )}
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#6d766b]">
            <SparkleIcon />
            Insights powered by FitAI
          </div>
        </div>
      </div>

      {/* Check-in nudge (personalises the AI) */}
      {!checkIn && (
        <button
          onClick={onGoToCheckIn}
          className="gcard mt-3 flex w-full items-center gap-3 p-[13px_15px] text-left transition hover:border-[rgba(183,236,74,0.28)]"
        >
          <SparkleIcon size={15} />
          <span className="flex-1 text-[12.5px] text-[#9aa398]">
            Complete your morning check-in so the coach can factor in energy, stress &amp; mood.
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#6d766b]">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Segment control */}
      <div className="mt-3.5 flex gap-0.5 rounded-[12px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.045)] p-[3px]">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            onClick={() => selectTab(s.id)}
            className={`relative flex-1 rounded-[9px] py-2 text-[12.5px] font-semibold transition ${
              active === s.id
                ? "bg-[rgba(255,255,255,0.08)] text-[#b7ec4a] shadow-[0_1px_6px_rgba(0,0,0,0.4)]"
                : "text-[#6d766b] hover:text-[#9aa398]"
            }`}
          >
            {s.label}
            {cache[s.id] && active !== s.id && (
              <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-[#b7ec4a]" />
            )}
          </button>
        ))}
      </div>

      {/* Strategy result area */}
      <div className="gcard mt-3 p-[16px_17px]">
        {phase === "unconfigured" ? (
          <p className="text-[13px] leading-[1.55] text-[#9aa398]">
            Live AI coaching needs a Gemini API key. Add{" "}
            <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 py-0.5 text-[12px] text-[#c8d0c2]">GEMINI_API_KEY</code>{" "}
            to <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 py-0.5 text-[12px] text-[#c8d0c2]">.env.local</code>. The day plan and limits below still work without it.
          </p>
        ) : phase === "task-input" ? (
          <>
            <div className="k-label mb-2">Plan today</div>
            <TaskInput
              onSubmit={(t) => {
                setTasks(t);
                void runStrategy("adjust", t);
              }}
            />
          </>
        ) : phase === "loading" || phase === "streaming" ? (
          <>
            <div className="flex items-center gap-2">
              <SparkleIcon />
              <span className="k-label text-[#b7ec4a]">
                {phase === "loading" ? "Thinking…" : "Writing…"}
              </span>
            </div>
            <div className="mt-3">
              {streamText ? (
                <p className="whitespace-pre-wrap text-[13.5px] leading-[1.6] text-[#c8d0c2]">
                  {streamText}
                  <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-[#b7ec4a] align-middle" />
                </p>
              ) : (
                <Shimmer />
              )}
            </div>
          </>
        ) : phase === "error" ? (
          <div>
            <p className="text-[13px] text-[#ef8b8b]">{error}</p>
            <button
              onClick={() => selectTab(active)}
              className="mt-3 rounded-full border border-[rgba(255,255,255,0.14)] px-4 py-1.5 text-[12.5px] font-semibold text-[#9aa398] transition hover:text-[#f4f6f2]"
            >
              Try again
            </button>
          </div>
        ) : strategy ? (
          <>
            {/* Title */}
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[15.5px] font-bold leading-snug text-[#f4f6f2]">{strategy.title}</h3>
              <span className="shrink-0 rounded-full border border-[rgba(255,255,255,0.1)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-[#9aa398]">
                {strategy.confidence} conf.
              </span>
            </div>

            {/* Explain: signals */}
            {active === "explain" && (
              <div className="mt-3">
                {strategy.reasoning.map((r, i) => {
                  const p = impactPill(r.impact);
                  return (
                    <div key={i} className="flex items-start gap-2.5 py-2 text-[13px] leading-[1.5] text-[#9aa398]">
                      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-[2.5px] text-[9.5px] font-bold uppercase tracking-[0.5px] ${p.cls}`}>
                        {p.label}
                      </span>
                      {r.signal}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Adjust: keep / reduce / move / avoid */}
            {active === "adjust" && strategy.adjustments && (
              <div className="mt-3 space-y-3">
                {(
                  [
                    { key: "keep", label: "Keep", cls: "text-[#b7ec4a]" },
                    { key: "reduce", label: "Reduce", cls: "text-[#e8b45a]" },
                    { key: "move", label: "Move", cls: "text-[#8b7cf6]" },
                    { key: "avoid", label: "Avoid", cls: "text-[#ef5b5b]" },
                  ] as const
                ).map(({ key, label, cls }) => {
                  const list = strategy.adjustments![key];
                  if (!list || list.length === 0) return null;
                  return (
                    <div key={key}>
                      <div className={`k-label ${cls}`}>{label}</div>
                      <ul className="mt-1.5 space-y-1">
                        {list.map((item, i) => (
                          <li key={i} className="flex gap-2 text-[13px] leading-[1.5] text-[#c8d0c2]">
                            <span className={cls}>•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Protect: protect tomorrow + minimum useful day */}
            {active === "protect" && (
              <div className="mt-3 space-y-3">
                {strategy.protectTomorrow && strategy.protectTomorrow.length > 0 && (
                  <div>
                    <div className="k-label text-[#b7ec4a]">Protect tomorrow</div>
                    <ul className="mt-1.5 space-y-1">
                      {strategy.protectTomorrow.map((item, i) => (
                        <li key={i} className="flex gap-2 text-[13px] leading-[1.5] text-[#c8d0c2]">
                          <span className="text-[#b7ec4a]">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {strategy.minimumUsefulDay && strategy.minimumUsefulDay.length > 0 && (
                  <div>
                    <div className="k-label text-[#8b7cf6]">Minimum useful day</div>
                    <ul className="mt-1.5 space-y-1">
                      {strategy.minimumUsefulDay.map((item, i) => (
                        <li key={i} className="flex gap-2 text-[13px] leading-[1.5] text-[#c8d0c2]">
                          <span className="text-[#8b7cf6]">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Recommended focus */}
            {strategy.recommendedFocus && (
              <div className="mt-3 rounded-[13px] border border-[rgba(183,236,74,0.2)] bg-[rgba(183,236,74,0.06)] px-3.5 py-3">
                <div className="k-label text-[#b7ec4a]">Recommended focus</div>
                <p className="mt-1 text-[13px] leading-[1.5] text-[#e7f2d4]">{strategy.recommendedFocus}</p>
              </div>
            )}

            {strategy.confidenceReason && (
              <p className="mt-2.5 text-[11.5px] leading-[1.45] text-[#6d766b]">{strategy.confidenceReason}</p>
            )}

            {/* Regenerate */}
            <button
              onClick={() => {
                setCache((prev) => {
                  const next = { ...prev };
                  delete next[active];
                  return next;
                });
                void runStrategy(active, active === "adjust" ? tasks : undefined);
              }}
              className="mt-3 text-[12px] font-semibold text-[#6d766b] transition hover:text-[#9aa398]"
            >
              ↻ Regenerate
            </button>

            {/* Follow-up chat */}
            <ChatBlock
              messages={chatHistory[active] ?? []}
              streaming={chatStreaming[active] ?? ""}
              busy={chatBusy}
              onSend={sendChat}
            />
          </>
        ) : null}
      </div>

      {/* Training advice + focus (deterministic) */}
      <div className="gcard mt-3 p-[16px_17px]">
        <div className="flex items-stretch gap-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span className="text-[#b7ec4a]">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M6.5 6.5v11M17.5 6.5v11M4 9h2.5M17.5 9H20M4 15h2.5M17.5 15H20M6.5 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <span className="k-label">Training advice</span>
            </div>
            <div className="mt-2 text-[15.5px] font-bold text-[#f4f6f2]">{adviceTitle[band]}</div>
            <p className="mt-1 text-[13px] leading-[1.5] text-[#9aa398]">{bandHeroDesc(band, settings.deepWorkLabel)}</p>
          </div>
          <div className="flex w-[108px] shrink-0 flex-col items-center justify-center rounded-[14px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] px-2 py-3.5 text-center">
            <div className="k-label">Focus</div>
            <div className="mt-1 text-[17px] font-bold text-[#f4f6f2]">{focusPanel[band].value}</div>
            <div className="mt-1 text-[11px] leading-[1.35] text-[#9aa398]">{focusPanel[band].sub}</div>
          </div>
        </div>
      </div>

      {/* Today's limits (deterministic guardrails) */}
      <div className="gcard mt-3 p-[16px_17px]">
        <div className="flex items-center gap-2.5">
          <span className="text-[#b7ec4a]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 3l7 4v5c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="k-label">Today&apos;s limits</span>
          <span className={`ml-auto rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${chipTone}`}>
            {bandGearLabel(band)} · {score}
          </span>
        </div>
        <div className="mt-2.5">
          {guardrails.rows.map((row, i) => {
            const tag = tagStyle[row.level];
            return (
              <div
                key={i}
                className="flex items-center gap-3 border-t border-[rgba(255,255,255,0.06)] py-3 text-[13.5px] first-of-type:border-t-0"
              >
                <span className="w-[108px] shrink-0 text-[12.5px] text-[#6d766b]">{row.label}</span>
                <span className="flex-1 font-[650] text-[#f4f6f2]">{row.value}</span>
                <span className={`rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.5px] ${tag.cls}`}>
                  {tag.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Night reflection */}
      <ReflectionCard date={date} />

      <p className="mx-1 mb-2 mt-4 text-center text-[10.5px] leading-[1.5] text-[#6d766b]">
        Productivity guidance based on available signals — not medical advice. The day type is set by
        FitAI&apos;s scoring logic, never by the AI.
      </p>
    </div>
  );
}
