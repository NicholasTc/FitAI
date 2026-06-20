/**
 * POST /api/strategy
 *
 * Streams an AI coaching response from Gemini Flash.
 * SSE events emitted:
 *   { type: "chunk",      text: string }   — prose streaming
 *   { type: "finalizing"                }  — [[JSON_START]] marker seen
 *   { type: "done",  summary: string, strategy: StrategyResponse }
 *   { type: "error", message: string   }
 */

import { auth } from "@/lib/auth";
import { buildAiContext } from "@/lib/ai/aiContext";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/ai/aiPrompt";
import { getGeminiModel } from "@/lib/ai/gemini";
import { computeBaseline } from "@/lib/baseline";
import { computeReadiness } from "@/lib/readiness";
import { computeGuardrails } from "@/lib/guardrails";
import { db } from "@/lib/db";
import { loadSnapshots, loadLastWorkout } from "@/lib/sync";
import type { CheckInData } from "@/types/today";
import type { DailySnapshot } from "@/types/snapshot";
import type { StrategyAction, StrategyResponse } from "@/types/strategy";
import { type NextRequest } from "next/server";

const JSON_MARKER = "[[JSON_START]]";

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
  totalCalories: null,
});

function isStrategyResponse(v: unknown): v is StrategyResponse {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.title === "string" &&
    Array.isArray(obj.reasoning) &&
    ["high", "medium", "low"].includes(obj.confidence as string)
  );
}

export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      {
        error:
          "AI not configured. Add GEMINI_API_KEY to .env.local — see README for instructions.",
      },
      { status: 503 },
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let action: StrategyAction;
  let tasks: string[] | undefined;
  let date: string;

  try {
    const body = (await request.json()) as {
      action?: unknown;
      tasks?: unknown;
      date?: unknown;
    };
    if (
      body.action !== "explain" &&
      body.action !== "adjust" &&
      body.action !== "protect"
    ) {
      return Response.json({ error: "Invalid action" }, { status: 400 });
    }
    action = body.action;
    tasks = Array.isArray(body.tasks)
      ? (body.tasks as string[]).filter((t) => typeof t === "string")
      : undefined;
    date =
      typeof body.date === "string"
        ? body.date
        : new Date().toLocaleDateString("en-CA");
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // ── Load data from DB (no sync — today route already synced) ────────────
  const windowStart = new Date(date);
  windowStart.setDate(windowStart.getDate() - 6);
  const sinceDate = windowStart.toISOString().slice(0, 10);

  const [history, lastWorkout, rawSettings] = await Promise.all([
    loadSnapshots(session.user.id, date),
    loadLastWorkout(session.user.id, sinceDate),
    db.userSettings.findUnique({ where: { userId: session.user.id } }),
  ]);
  const today = history.find((s) => s.date === date) ?? NULL_SNAPSHOT(date);
  const { baseline } = computeBaseline(history, today);

  const userProfile = rawSettings && (rawSettings.age || rawSettings.sex)
    ? { age: rawSettings.age, sex: rawSettings.sex as "male" | "female" | null, heightCm: rawSettings.heightCm, weightKg: rawSettings.weightKg }
    : null;

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
  const guardrails = computeGuardrails(readiness.dayType, readiness.score, baseline.sleepMinutes);

  // ── Build prompt ────────────────────────────────────────────────────────
  const context = buildAiContext(
    today,
    baseline,
    checkIn,
    readiness.dayType,
    readiness.score,
    date,
    tasks,
    lastWorkout,
    userProfile,
    guardrails.band,
  );
  const userPrompt = buildUserPrompt(action, context, readiness.dayType);

  // ── Stream Gemini response ───────────────────────────────────────────────
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      function emit(data: object) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      }

      try {
        const model = getGeminiModel(SYSTEM_PROMPT);
        const result = await model.generateContentStream(userPrompt);

        let accumulated = "";
        let proseSentChars = 0;
        let markerSeen = false;

        for await (const chunk of result.stream) {
          const text = chunk.text();
          accumulated += text;

          const markerIdx = accumulated.indexOf(JSON_MARKER);

          if (markerIdx === -1) {
            // Still in prose — stream this chunk
            emit({ type: "chunk", text });
            proseSentChars += text.length;
          } else if (!markerSeen) {
            // Marker just appeared — send remaining prose before it
            markerSeen = true;
            const remainingProse = accumulated.slice(proseSentChars, markerIdx);
            if (remainingProse.trim()) {
              emit({ type: "chunk", text: remainingProse });
            }
            emit({ type: "finalizing" });
          }
          // After marker: accumulate silently for JSON parsing
        }

        // ── Parse JSON ──────────────────────────────────────────────────
        // Primary: look for the explicit [[JSON_START]] marker.
        // Fallback: find the last standalone { that begins a valid JSON block.
        // This handles cases where the model wraps or omits the marker.
        let prose = "";
        let jsonStr = "";

        const markerIdx = accumulated.indexOf(JSON_MARKER);
        if (markerIdx !== -1) {
          prose = accumulated.slice(0, markerIdx).trim();
          jsonStr = accumulated.slice(markerIdx + JSON_MARKER.length).trim();
        } else {
          // Fallback: find the first `{` that starts a parseable JSON block
          const braceIdx = accumulated.indexOf("{");
          if (braceIdx === -1) {
            emit({
              type: "error",
              message: "The AI response was incomplete or malformed. Please try again.",
            });
            controller.close();
            return;
          }
          prose = accumulated.slice(0, braceIdx).trim();
          jsonStr = accumulated.slice(braceIdx).trim();
        }

        // Strip markdown code fences if the model wrapped the JSON (```json ... ```)
        jsonStr = jsonStr
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/, "")
          .trim();

        try {
          const parsed: unknown = JSON.parse(jsonStr);
          if (!isStrategyResponse(parsed)) {
            throw new Error("Schema mismatch");
          }
          emit({ type: "done", summary: prose, strategy: parsed });
        } catch {
          emit({
            type: "error",
            message:
              "Could not parse the strategy response. Please try again.",
          });
        }
      } catch (e) {
        emit({
          type: "error",
          message:
            e instanceof Error ? e.message : "An unexpected error occurred.",
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
