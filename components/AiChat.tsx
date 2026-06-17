"use client";

/**
 * Shared follow-up chat components used by StrategyPanel and the metric
 * explanation panel in TodayView.
 */

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const MAX_CHAT_TURNS = 10;

// ─── Thread ───────────────────────────────────────────────────────────────────

export function ChatThread({
  messages,
  streamingText,
}: {
  messages: ChatMessage[];
  streamingText: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText]);

  if (messages.length === 0 && !streamingText) return null;

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[rgba(148,162,218,0.1)] pt-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#9ea8c4]">
        Follow-up
      </p>
      {messages.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="flex justify-end">
            <div className="max-w-[85%] rounded-[12px] bg-[#eef3ff] px-3.5 py-2.5">
              <p className="text-[13px] leading-relaxed text-[#1b2040]">{m.content}</p>
            </div>
          </div>
        ) : (
          <div key={i} className="flex justify-start">
            <div className="max-w-[92%] rounded-[12px] border border-[rgba(148,162,218,0.14)] bg-[#f9faff] px-3.5 py-2.5">
              <p className="text-[13px] leading-relaxed text-[#1b2040]">{m.content}</p>
            </div>
          </div>
        ),
      )}
      {streamingText && (
        <div className="flex justify-start">
          <div className="max-w-[92%] rounded-[12px] border border-[rgba(148,162,218,0.14)] bg-[#f9faff] px-3.5 py-2.5">
            <p className="text-[13px] leading-relaxed text-[#1b2040]">
              {streamingText}
              <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-[#4a7df6] align-middle" />
            </p>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

export function ChatInput({
  onSend,
  disabled,
  atLimit,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  atLimit: boolean;
}) {
  const [draft, setDraft] = useState("");

  function submit() {
    const t = draft.trim();
    if (!t || disabled || atLimit) return;
    onSend(t);
    setDraft("");
  }

  if (atLimit) {
    return (
      <p className="mt-3 text-center text-[11.5px] text-[#9ea8c4]">
        Conversation limit reached. Dismiss and re-open to start fresh.
      </p>
    );
  }

  return (
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
        disabled={disabled}
        className="flex-1 resize-none overflow-hidden rounded-[12px] border border-[rgba(148,162,218,0.3)] bg-white px-3.5 py-2.5 text-[13.5px] text-[#1b2040] placeholder-[#9ea8c4] outline-none transition focus:border-[#4a7df6] focus:ring-2 focus:ring-[rgba(74,125,246,0.12)] disabled:opacity-50"
      />
      <button
        onClick={submit}
        disabled={disabled || !draft.trim()}
        aria-label="Send"
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] bg-[#4a7df6] text-white shadow-[0_2px_8px_rgba(74,125,246,0.25)] transition hover:bg-[#3a6de0] active:scale-95 disabled:opacity-40"
      >
        {disabled ? (
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
  );
}

// ─── Streaming helper ─────────────────────────────────────────────────────────

/**
 * Reads an SSE stream from /api/chat and calls `onChunk` / `onDone` / `onError`.
 * Caller is responsible for building and updating message history.
 */
export async function streamChatResponse(
  body: object,
  onChunk: (text: string) => void,
  onDone: (full: string) => void,
  onError: (msg: string) => void,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const err = res.ok
      ? "No response body"
      : ((await res.json()) as { error?: string }).error ?? "Chat failed";
    onError(err);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

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
          message?: string;
        };
        if (event.type === "chunk" && event.text) {
          accumulated += event.text;
          onChunk(accumulated);
        } else if (event.type === "done") {
          onDone(accumulated);
        } else if (event.type === "error") {
          onError(event.message ?? "Something went wrong");
        }
      } catch {
        // Malformed SSE line — skip
      }
    }
  }
}
