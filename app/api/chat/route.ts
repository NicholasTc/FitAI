/**
 * POST /api/chat
 *
 * Follow-up chat grounded in:
 *   1. The user's health context for `date` (re-loaded server-side — never trust client)
 *   2. The AI's original strategy response for the active tab (passed as first assistant turn)
 *   3. The conversation history so far
 *
 * Streams plain text only — no JSON schema, no [[JSON_START]] marker.
 * SSE events:
 *   { type: "chunk", text: string }
 *   { type: "done" }
 *   { type: "error", message: string }
 */

import { auth } from "@/lib/auth";
import { buildAiContext } from "@/lib/ai/aiContext";
import { getGeminiModel } from "@/lib/ai/gemini";
import { computeBaseline } from "@/lib/baseline";
import { computeReadiness } from "@/lib/readiness";
import { db } from "@/lib/db";
import { loadSnapshots, loadLastWorkout } from "@/lib/sync";
import type { CheckInData } from "@/types/today";
import type { DailySnapshot } from "@/types/snapshot";
import type { StrategyAction } from "@/types/strategy";
import { type NextRequest } from "next/server";

const MAX_HISTORY = 10;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  date: string;
  action: StrategyAction;
  /** The full text of the AI's initial strategy response — becomes first assistant turn */
  originalResponse: string;
  history: ChatMessage[];
}

const NULL_SNAPSHOT = (date: string): DailySnapshot => ({
  date,
  sleepMinutes: null,
  sleepEfficiency: null,
  sleepDeepMin: null,
  sleepRemMin: null,
  sleepLightMin: null,
  restingHr: null,
  hrv: null,
  steps: null,
  activeMinutes: null,
});

const CHAT_SYSTEM_PROMPT = `\
You are FitAI, a personal recovery coach. The user trains 4–5x/week (strength + cardio).
You are answering follow-up questions about a strategy recommendation you just gave.

## Rules
- You have already given an initial recommendation. The user is asking follow-up questions about it.
- NEVER recalculate or override the day type — it was set by deterministic app logic.
- Always cite real numbers from the health context. Never invent values.
- Address the user as "you", never by name.
- Be concise and specific. 2–4 sentences per answer is the target — expand only when necessary.
- If a question is outside the scope of today's readiness (e.g. general fitness advice unrelated to today's data), answer briefly and redirect to what the data says.
- No medical claims or diagnoses.
- No motivational-speaker language.`;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { error: "AI not configured. Add GEMINI_API_KEY to .env.local." },
      { status: 503 },
    );
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
    if (
      typeof body.date !== "string" ||
      !["explain", "adjust", "protect"].includes(body.action) ||
      typeof body.originalResponse !== "string" ||
      !Array.isArray(body.history)
    ) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (body.history.length > MAX_HISTORY) {
      return Response.json(
        { error: "Conversation too long. Please start a new thread." },
        { status: 400 },
      );
    }
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { date, action, originalResponse, history } = body;

  // ── Re-load health data server-side ──────────────────────────────────────
  const windowStart = new Date(date);
  windowStart.setDate(windowStart.getDate() - 6);
  const sinceDate = windowStart.toISOString().slice(0, 10);

  const [snapHistory, lastWorkout] = await Promise.all([
    loadSnapshots(session.user.id, date),
    loadLastWorkout(session.user.id, sinceDate),
  ]);
  const today = snapHistory.find((s) => s.date === date) ?? NULL_SNAPSHOT(date);
  const { baseline } = computeBaseline(snapHistory, today);

  const rawCheckIn = await db.checkIn.findUnique({
    where: { userId_date: { userId: session.user.id, date } },
  });
  const checkIn: CheckInData | null = rawCheckIn
    ? {
        date: rawCheckIn.date,
        energyLevel: rawCheckIn.energyLevel,
        stressLevel: rawCheckIn.stressLevel,
        sleepQuality: rawCheckIn.sleepQuality,
        motivation: rawCheckIn.motivation,
      }
    : null;

  const readiness = computeReadiness(today, baseline, checkIn);
  const context = buildAiContext(
    today, baseline, checkIn, readiness.dayType, readiness.score, date, undefined, lastWorkout,
  );

  const actionLabel =
    action === "explain" ? "Explain (why today is this day type)"
    : action === "adjust" ? "Plan Today (task prioritisation)"
    : "Set up Tomorrow (tonight's actions)";

  // ── Build Gemini chat history ─────────────────────────────────────────────
  // Structure:
  //   user turn 1:  health context + action + "here is the initial response"
  //   model turn 1: the original strategy response text
  //   user turn 2+: actual user follow-ups
  //   model turns:  AI answers
  const geminiHistory = [
    {
      role: "user" as const,
      parts: [{
        text: `Here is the user's health data for today:\n\`\`\`json\n${context}\n\`\`\`\n\nThe active strategy tab is: ${actionLabel}\n\nBelow is the initial recommendation you gave:`,
      }],
    },
    {
      role: "model" as const,
      parts: [{ text: originalResponse }],
    },
    // Insert prior conversation turns
    ...history.slice(0, -1).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    })),
  ];

  // The latest user message is the one we send now
  const latestUserMessage = history.at(-1);
  if (!latestUserMessage || latestUserMessage.role !== "user") {
    return Response.json({ error: "No user message to respond to" }, { status: 400 });
  }

  // ── Stream Gemini chat response ───────────────────────────────────────────
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      function emit(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const model = getGeminiModel(CHAT_SYSTEM_PROMPT);
        const chat = model.startChat({ history: geminiHistory });
        const result = await chat.sendMessageStream(latestUserMessage.content);

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) emit({ type: "chunk", text });
        }

        emit({ type: "done" });
      } catch (e) {
        emit({
          type: "error",
          message: e instanceof Error ? e.message : "An unexpected error occurred.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
