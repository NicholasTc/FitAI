"use client";

/**
 * StrategyPanel — Today's Strategy AI coaching panel.
 *
 * Three actions:
 *   Explain           – Why today's day type was assigned
 *   Plan Today        – Prioritise user-entered tasks given recovery state
 *   Set up Tomorrow   – What to do tonight to set up a strong tomorrow
 *
 * Streams from POST /api/strategy, showing prose as typewriter text,
 * then transitioning to structured cards.
 */

import { AppIcon } from "@/components/AppIcon";
import type { DayType } from "@/types/today";
import type {
  StrategyCacheEntry,
  StrategyAction,
  StrategyAdjustments,
  StrategyConfidence,
  StrategyResponse,
  StrategySignal,
  SignalImpact,
} from "@/types/strategy";
import { useCallback, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | "idle"
  | "task-input"
  | "loading"
  | "streaming"
  | "finalizing"
  | "done"
  | "error";

interface StrategyPanelProps {
  date: string;
  dayType: DayType;
  hasCheckIn: boolean;
}

// ─── Design tokens ─────────────────────────────────────────────────────────────

const ACTION_META: Record<
  StrategyAction,
  { label: string; shortLabel: string; description: string; icon: "chart" | "energy" | "stress-low" }
> = {
  explain: {
    label: "Explain",
    shortLabel: "Explain",
    description: "Why today is Push / Maintain / Recover",
    icon: "chart",
  },
  adjust: {
    label: "Plan Today",
    shortLabel: "Plan Today",
    description: "Prioritise your tasks around your recovery state",
    icon: "energy",
  },
  protect: {
    label: "Set up Tomorrow",
    shortLabel: "Set up Tomorrow",
    description: "Set yourself up for a stronger tomorrow",
    icon: "stress-low",
  },
};

const IMPACT_STYLE: Record<
  SignalImpact,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  positive: {
    bg: "bg-[#ecfaf6]",
    text: "text-[#009e83]",
    border: "border-[rgba(0,158,131,0.2)]",
    dot: "bg-[#009e83]",
    label: "Positive",
  },
  limiting: {
    bg: "bg-[#fff3f0]",
    text: "text-[#e05f3c]",
    border: "border-[rgba(224,95,60,0.2)]",
    dot: "bg-[#e05f3c]",
    label: "Limiting",
  },
  neutral: {
    bg: "bg-[#f4f5fb]",
    text: "text-[#9ea8c4]",
    border: "border-[rgba(148,162,218,0.2)]",
    dot: "bg-[#9ea8c4]",
    label: "Neutral",
  },
};

const CONFIDENCE_STYLE: Record<
  StrategyConfidence,
  { bg: string; text: string; label: string }
> = {
  high: { bg: "bg-[#ecfaf6]", text: "text-[#009e83]", label: "High confidence" },
  medium: { bg: "bg-[#fff8f0]", text: "text-[#c87a36]", label: "Medium confidence" },
  low: { bg: "bg-[#fff3f0]", text: "text-[#e05f3c]", label: "Lower confidence" },
};

const ADJUST_CATEGORY_STYLE: Record<
  keyof StrategyAdjustments,
  { bgColor: string; borderColor: string; prefix: string; prefixColor: string }
> = {
  keep:   { bgColor: "#ecfaf6", borderColor: "rgba(0,158,131,0.18)",  prefix: "Keep",   prefixColor: "text-[#009e83]" },
  reduce: { bgColor: "#fff8f0", borderColor: "rgba(200,122,54,0.18)", prefix: "Reduce", prefixColor: "text-[#c87a36]" },
  move:   { bgColor: "#eef3ff", borderColor: "rgba(74,125,246,0.18)", prefix: "Move",   prefixColor: "text-[#4a7df6]" },
  avoid:  { bgColor: "#fff3f0", borderColor: "rgba(224,95,60,0.18)",  prefix: "Avoid",  prefixColor: "text-[#e05f3c]" },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function SignalRow({ signal }: { signal: StrategySignal }) {
  const s = IMPACT_STYLE[signal.impact];
  return (
    <div className={`flex items-start gap-2.5 rounded-[10px] border p-3 ${s.bg} ${s.border}`}>
      <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      <span className="flex-1 text-[13px] leading-relaxed text-[#1b2040]">
        {signal.signal}
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    </div>
  );
}

function FocusBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[12px] bg-[#eef3ff] p-3.5">
      <AppIcon name="motivation" size={16} className="mt-px shrink-0 text-[#4a7df6]" />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4a7df6]">
          Recommended focus
        </p>
        <p className="mt-0.5 text-[13px] text-[#1b2040]">{text}</p>
      </div>
    </div>
  );
}

function ConfidenceBadge({
  confidence,
  reason,
}: {
  confidence: StrategyConfidence;
  reason?: string;
}) {
  const s = CONFIDENCE_STYLE[confidence];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
      {reason && (
        <span className="text-[11.5px] text-[#9ea8c4]">{reason}</span>
      )}
    </div>
  );
}

function Disclaimer() {
  return (
    <p className="text-[11px] text-[#9ea8c4]">
      For lifestyle planning only — not medical advice.
    </p>
  );
}

// ─── Shimmer loading skeleton ──────────────────────────────────────────────────

function LoadingShimmer({ label }: { label: string }) {
  return (
    <div className="space-y-3 pt-1">
      <p className="flex items-center gap-2 text-[13px] text-[#63708f]">
        <span className="inline-block h-2 w-2 animate-ping rounded-full bg-[#4a7df6] opacity-75" />
        {label}
      </p>
      <div className="space-y-2">
        {[70, 90, 55].map((w, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded-full bg-[#eef3ff]"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Streaming text display ────────────────────────────────────────────────────

function StreamingText({ text }: { text: string }) {
  return (
    <div className="rounded-[12px] bg-[#f9faff] p-4">
      <p className="text-[14px] leading-relaxed text-[#1b2040]">
        {text}
        <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-[#4a7df6] align-middle" />
      </p>
    </div>
  );
}

// ─── Result cards per action ───────────────────────────────────────────────────

function ExplainResult({ summary, strategy }: { summary: string; strategy: StrategyResponse }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-[family-name:var(--font-display)] text-[16px] font-bold text-[#1b2040]">
          {strategy.title}
        </h4>
        {summary && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#63708f]">{summary}</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ea8c4]">
          What drove this
        </p>
        {strategy.reasoning.map((s, i) => (
          <SignalRow key={i} signal={s} />
        ))}
      </div>

      {strategy.recommendedFocus && (
        <FocusBanner text={strategy.recommendedFocus} />
      )}

      <ConfidenceBadge confidence={strategy.confidence} reason={strategy.confidenceReason} />
      <Disclaimer />
    </div>
  );
}

function AdjustResult({ summary, strategy }: { summary: string; strategy: StrategyResponse }) {
  const adj = strategy.adjustments;
  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-[family-name:var(--font-display)] text-[16px] font-bold text-[#1b2040]">
          {strategy.title}
        </h4>
        {summary && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#63708f]">{summary}</p>
        )}
      </div>

      {strategy.recommendedFocus && (
        <FocusBanner text={strategy.recommendedFocus} />
      )}

      {adj && (
        <div className="space-y-2">
          {(["keep", "reduce", "move", "avoid"] as const).map((cat) => {
            const items = adj[cat];
            if (!items || items.length === 0) return null;
            const s = ADJUST_CATEGORY_STYLE[cat];
            return (
              <div
                key={cat}
                className="rounded-[12px] border p-3.5"
                style={{ background: s.bgColor, borderColor: s.borderColor }}
              >
                <p className={`mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] ${s.prefixColor}`}>
                  {s.prefix}
                </p>
                <ul className="space-y-1">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-[#1b2040]">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#9ea8c4]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {!adj && strategy.reasoning.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ea8c4]">
            Key signals
          </p>
          {strategy.reasoning.map((s, i) => (
            <SignalRow key={i} signal={s} />
          ))}
        </div>
      )}

      <ConfidenceBadge confidence={strategy.confidence} reason={strategy.confidenceReason} />
      <Disclaimer />
    </div>
  );
}

function ProtectResult({ summary, strategy }: { summary: string; strategy: StrategyResponse }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-[family-name:var(--font-display)] text-[16px] font-bold text-[#1b2040]">
          {strategy.title}
        </h4>
        {summary && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#63708f]">{summary}</p>
        )}
      </div>

      {strategy.protectTomorrow && strategy.protectTomorrow.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ea8c4]">
            Tonight's actions
          </p>
          <div className="rounded-[12px] border border-[rgba(148,162,218,0.14)] bg-[#f9faff] p-4">
            <ul className="space-y-2.5">
              {strategy.protectTomorrow.map((tip, i) => (
                <li key={i} className="flex items-start gap-3">
                  <AppIcon
                    name="stress-low"
                    size={14}
                    className="mt-px shrink-0 text-[#009e83]"
                  />
                  <span className="text-[13px] leading-relaxed text-[#1b2040]">
                    {tip}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {strategy.minimumUsefulDay && strategy.minimumUsefulDay.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ea8c4]">
            Minimum useful day (Recover)
          </p>
          <div className="rounded-[12px] border border-[rgba(148,162,218,0.14)] bg-[#f4f5fb] p-4">
            <ul className="space-y-2.5">
              {strategy.minimumUsefulDay.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <AppIcon
                    name="motivation"
                    size={14}
                    className="mt-px shrink-0 text-[#7850e2]"
                  />
                  <span className="text-[13px] leading-relaxed text-[#1b2040]">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ConfidenceBadge confidence={strategy.confidence} reason={strategy.confidenceReason} />
      <Disclaimer />
    </div>
  );
}

// ─── Task input ────────────────────────────────────────────────────────────────

function TaskInput({
  tasks,
  onTasksChange,
  onSubmit,
}: {
  tasks: string[];
  onTasksChange: (t: string[]) => void;
  onSubmit: () => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTask() {
    const t = draft.trim();
    if (!t || tasks.length >= 5) return;
    onTasksChange([...tasks, t]);
    setDraft("");
    inputRef.current?.focus();
  }

  function removeTask(idx: number) {
    onTasksChange(tasks.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-[family-name:var(--font-display)] text-[14px] font-bold text-[#1b2040]">
          What&apos;s on your plate today?
        </p>
        <p className="mt-0.5 text-[12.5px] text-[#63708f]">
          Enter up to 5 tasks — FitAI will prioritise them around your
          recovery state.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="Add a task…"
          disabled={tasks.length >= 5}
          className="flex-1 rounded-[10px] border border-[rgba(148,162,218,0.3)] bg-white px-3.5 py-2.5 text-[13.5px] text-[#1b2040] placeholder-[#9ea8c4] outline-none transition focus:border-[#4a7df6] focus:ring-2 focus:ring-[rgba(74,125,246,0.12)] disabled:opacity-50"
        />
        <button
          onClick={addTask}
          disabled={!draft.trim() || tasks.length >= 5}
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] bg-[#4a7df6] text-white transition hover:bg-[#3a6de0] disabled:opacity-40"
          aria-label="Add task"
        >
          <span className="text-lg font-light">+</span>
        </button>
      </div>

      {tasks.length > 0 && (
        <ul className="space-y-2">
          {tasks.map((task, i) => (
            <li
              key={i}
              className="flex items-center gap-2.5 rounded-[10px] border border-[rgba(148,162,218,0.14)] bg-[#f9faff] px-3.5 py-2.5"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4a7df6]" />
              <span className="flex-1 text-[13px] text-[#1b2040]">{task}</span>
              <button
                onClick={() => removeTask(i)}
                className="text-[#9ea8c4] transition hover:text-[#e05f3c]"
                aria-label="Remove task"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={onSubmit}
        disabled={tasks.length === 0}
        className="w-full rounded-[12px] bg-[#4a7df6] px-4 py-3 text-[13.5px] font-semibold text-white transition hover:bg-[#3a6de0] disabled:opacity-40"
      >
        Get adjustment plan →
      </button>
      <p className="text-center text-[11px] text-[#9ea8c4]">
        Or skip task input — you&apos;ll get general guidance.
      </p>
      <button
        onClick={onSubmit}
        className="w-full text-[12px] text-[#4a7df6] hover:underline"
      >
        Skip and get general advice
      </button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function StrategyPanel({
  date,
  dayType,
  hasCheckIn,
}: StrategyPanelProps) {
  const [active, setActive] = useState<StrategyAction | null>(null);
  const [tasks, setTasks] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [streamText, setStreamText] = useState("");
  const [summary, setSummary] = useState("");
  const [strategy, setStrategy] = useState<StrategyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<
    Partial<Record<StrategyAction, StrategyCacheEntry>>
  >({});

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
              } else if (event.type === "finalizing") {
                setPhase("finalizing");
              } else if (
                event.type === "done" &&
                event.strategy &&
                event.summary !== undefined
              ) {
                setSummary(event.summary);
                setStrategy(event.strategy);
                setCache((prev) => ({
                  ...prev,
                  [action]: {
                    summary: event.summary!,
                    strategy: event.strategy!,
                    tasks: taskList,
                  },
                }));
                setPhase("done");
              } else if (event.type === "error") {
                setError(event.message ?? "An error occurred.");
                setPhase("error");
              }
            } catch {
              // Malformed SSE line — skip
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

  function handleTabClick(action: StrategyAction) {
    // If same tab and done — stay
    if (action === active && phase === "done") return;

    // Check cache for instant result
    const cached = cache[action];
    if (cached) {
      setActive(action);
      setSummary(cached.summary);
      setStrategy(cached.strategy);
      setPhase("done");
      return;
    }

    setActive(action);

    // Adjust needs task input first (if no tasks)
    if (action === "adjust" && tasks.length === 0) {
      setPhase("task-input");
      return;
    }

    void runStrategy(action, action === "adjust" ? tasks : undefined);
  }

  function handleRegenerate() {
    if (!active) return;
    // Clear cache for this action so we get a fresh response
    setCache((prev) => {
      const next = { ...prev };
      delete next[active];
      return next;
    });
    void runStrategy(active, active === "adjust" ? tasks : undefined);
  }

  function handleTaskSubmit() {
    void runStrategy("adjust", tasks);
  }

  function handleEditTasks() {
    setCache((prev) => {
      const next = { ...prev };
      delete next.adjust;
      return next;
    });
    setPhase("task-input");
    setStreamText("");
    setSummary("");
    setStrategy(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isWorking =
    phase === "loading" || phase === "streaming" || phase === "finalizing";

  return (
    <div className="rounded-[18px] border border-[rgba(148,162,218,0.14)] bg-white shadow-[0_2px_14px_rgba(80,100,180,0.06)]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-[rgba(148,162,218,0.1)] px-5 py-4">
        <div className="flex items-center gap-2">
          <AppIcon name="ai" size={16} className="text-[#4a7df6]" />
          <h3 className="font-[family-name:var(--font-display)] text-[15px] font-bold text-[#1b2040]">
            Today&apos;s Strategy
          </h3>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-[#f4f5fb] px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4a7df6]" />
          <span className="text-[10.5px] font-medium text-[#63708f]">
            Gemini · Not medical advice
          </span>
        </div>
      </div>

      {/* ── Action tabs ── */}
      <div className="flex gap-1.5 border-b border-[rgba(148,162,218,0.1)] px-5 py-3">
        {(Object.keys(ACTION_META) as StrategyAction[]).map((action) => {
          const meta = ACTION_META[action];
          const isActive = active === action;
          const hasCached = !!cache[action];
          return (
            <button
              key={action}
              onClick={() => handleTabClick(action)}
              disabled={isWorking}
              className={`flex items-center gap-1.5 rounded-[9px] border px-3 py-2 text-[12.5px] font-semibold transition disabled:opacity-60 ${
                isActive
                  ? "border-[rgba(74,125,246,0.28)] bg-[#eef3ff] text-[#4a7df6]"
                  : "border-transparent bg-[#f4f5fb] text-[#63708f] hover:border-[rgba(148,162,218,0.3)] hover:bg-white hover:text-[#1b2040]"
              }`}
            >
              <AppIcon
                name={meta.icon}
                size={13}
                className={isActive ? "text-[#4a7df6]" : "text-current"}
              />
              <span>{meta.shortLabel}</span>
              {hasCached && !isActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#009e83]" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div className="p-5">
        {/* Idle */}
        {phase === "idle" && (
          <div className="space-y-4">
            {!hasCheckIn && (
              <div className="flex items-start gap-2.5 rounded-[12px] border border-[rgba(246,162,53,0.25)] bg-[#fffbf0] px-4 py-3">
                <AppIcon name="info" size={14} className="mt-px shrink-0 text-[#c87a36]" />
                <p className="text-[12.5px] text-[#7a4a1c]">
                  Complete your morning check-in first for better strategy
                  accuracy — subjective feel matters most.
                </p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(ACTION_META) as StrategyAction[]).map((action) => {
                const meta = ACTION_META[action];
                return (
                  <button
                    key={action}
                    onClick={() => handleTabClick(action)}
                    className="group flex flex-col items-start gap-2 rounded-[14px] border border-[rgba(148,162,218,0.14)] bg-[#f9faff] p-4 text-left transition hover:border-[rgba(74,125,246,0.25)] hover:bg-[#eef3ff]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white shadow-sm transition group-hover:bg-[#eef3ff]">
                      <AppIcon
                        name={meta.icon}
                        size={16}
                        className="text-[#4a7df6]"
                      />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-[#1b2040]">
                        {meta.label}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-[#63708f]">
                        {meta.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Task input */}
        {phase === "task-input" && (
          <TaskInput
            tasks={tasks}
            onTasksChange={setTasks}
            onSubmit={handleTaskSubmit}
          />
        )}

        {/* Loading */}
        {phase === "loading" && (
          <LoadingShimmer
            label={`Analysing your ${active === "explain" ? "signals" : active === "adjust" ? "tasks and recovery state" : "today's signals"}…`}
          />
        )}

        {/* Streaming */}
        {phase === "streaming" && streamText && (
          <StreamingText text={streamText} />
        )}
        {phase === "streaming" && !streamText && (
          <LoadingShimmer label="Generating…" />
        )}

        {/* Finalizing */}
        {phase === "finalizing" && (
          <div className="space-y-3">
            {streamText && (
              <div className="rounded-[12px] bg-[#f9faff] p-4">
                <p className="text-[14px] leading-relaxed text-[#1b2040]">
                  {streamText}
                </p>
              </div>
            )}
            <p className="flex items-center gap-2 text-[13px] text-[#63708f]">
              <span className="inline-block h-2 w-2 animate-ping rounded-full bg-[#4a7df6] opacity-75" />
              Preparing your strategy…
            </p>
          </div>
        )}

        {/* Done */}
        {phase === "done" && strategy && (
          <div>
            {active === "explain" && (
              <ExplainResult summary={summary} strategy={strategy} />
            )}
            {active === "adjust" && (
              <AdjustResult summary={summary} strategy={strategy} />
            )}
            {active === "protect" && (
              <ProtectResult summary={summary} strategy={strategy} />
            )}

            {/* Footer actions */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(148,162,218,0.1)] pt-4">
              <button
                onClick={handleRegenerate}
                className="rounded-[9px] border border-[rgba(148,162,218,0.25)] px-3.5 py-2 text-[12.5px] font-medium text-[#63708f] transition hover:border-[rgba(74,125,246,0.3)] hover:text-[#4a7df6]"
              >
                Regenerate
              </button>
              {active === "adjust" && (
                <button
                  onClick={handleEditTasks}
                  className="text-[12px] text-[#4a7df6] hover:underline"
                >
                  Edit tasks
                </button>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="space-y-3 rounded-[12px] border border-[rgba(224,95,60,0.2)] bg-[#fff3f0] p-4">
            <div className="flex items-start gap-2.5">
              <AppIcon name="stress" size={16} className="mt-px shrink-0 text-[#e05f3c]" />
              <p className="text-[13px] text-[#7a1c1c]">
                {error ?? "Something went wrong."}
              </p>
            </div>
            <button
              onClick={handleRegenerate}
              className="rounded-[9px] border border-[rgba(224,95,60,0.25)] px-3.5 py-2 text-[12.5px] font-medium text-[#e05f3c] transition hover:bg-[rgba(224,95,60,0.06)]"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
