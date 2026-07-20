/**
 * POST /api/health-insight
 *
 * Returns a short, live AI interpretation of today's overall health picture for
 * the Health screen's "AI Interpretation" card. Prose only (no streaming, no
 * schema), and it must use the real numbers the client supplies — every value
 * here is derived from the user's stored snapshot / baseline / check-in.
 */

import { auth } from "@/lib/auth";
import { getGeminiModel } from "@/lib/ai/gemini";
import { type NextRequest, NextResponse } from "next/server";

export interface HealthInsightRequest {
  readiness: number;
  readinessWord: string;
  dayType: "push" | "maintain" | "recover";
  sleepMinutes: number | null;
  sleepEfficiency: number | null;
  deepMin: number | null;
  remMin: number | null;
  hrv: number | null;
  hrvBaseline: number | null;
  hrvDeltaVsYesterday: number | null;
  restingHr: number | null;
  restingHrBaseline: number | null;
  restingHrDeltaVsYesterday: number | null;
  steps: number | null;
  baselineStatus: "forming" | "ready";
  baselineDays: number;
  checkIn: {
    energy: number;
    stress: number;
    sleepQuality: number;
    motivation: number;
  } | null;
}

const HEALTH_SYSTEM_PROMPT = `\
You are FitAI, a personal recovery coach. The user trains 4–5x/week (strength + cardio).
Your job is to interpret today's overall health picture in a calm, confident, non-alarmist voice.

Write EXACTLY this format — no deviations, no headers, no markdown, no bullet points:

<Sentence 1: the single most important takeaway about the body's state today, using the real numbers.>
<Sentence 2: the "why" — the 1–2 signals driving that read (HRV vs baseline, resting HR, sleep, or subjective check-in).>
<Sentence 3: one clear recommendation for training + effort today, consistent with the Push / Maintain / Recover day type.>

Rules:
- 3 sentences total. Warm but precise. No emojis.
- Use the actual numbers provided — never invent or estimate missing values.
- If a signal is "not available", do not mention it as if it were measured.
- Subjective check-in signals take priority over wearable data when they conflict.
- No medical claims or diagnoses. Address the user as "you", never by name.`;

function buildHealthPrompt(d: HealthInsightRequest): string {
  const na = (v: number | null, suffix = "") =>
    v === null ? "not available" : `${Math.round(v)}${suffix}`;

  const hrvLine =
    d.hrv === null
      ? "HRV: not available"
      : `HRV: ${Math.round(d.hrv)} ms (baseline ${na(d.hrvBaseline)} ms, ${
          d.hrvDeltaVsYesterday === null
            ? "no prior day"
            : `${d.hrvDeltaVsYesterday >= 0 ? "+" : ""}${Math.round(d.hrvDeltaVsYesterday)} ms vs yesterday`
        })`;

  const rhrLine =
    d.restingHr === null
      ? "Resting HR: not available"
      : `Resting HR: ${Math.round(d.restingHr)} bpm (baseline ${na(d.restingHrBaseline)} bpm, ${
          d.restingHrDeltaVsYesterday === null
            ? "no prior day"
            : `${d.restingHrDeltaVsYesterday >= 0 ? "+" : ""}${Math.round(d.restingHrDeltaVsYesterday)} bpm vs yesterday`
        })`;

  const sleepLine =
    d.sleepMinutes === null
      ? "Sleep: not available"
      : `Sleep: ${Math.floor(d.sleepMinutes / 60)}h ${d.sleepMinutes % 60}m (efficiency ${na(d.sleepEfficiency, "%")}, deep ${na(d.deepMin, "m")}, REM ${na(d.remMin, "m")})`;

  const checkInLine = d.checkIn
    ? `Morning check-in — energy ${d.checkIn.energy}/10, stress ${d.checkIn.stress}/10, sleep quality ${d.checkIn.sleepQuality}/10, motivation ${d.checkIn.motivation}/10`
    : "Morning check-in: not completed today";

  const baselineLine =
    d.baselineStatus === "forming"
      ? `Baseline still forming (${d.baselineDays}/7 days) — treat comparisons as directional.`
      : "Personal baseline is established.";

  return `Interpret the user's overall health and recovery for today using the required 3-sentence format. Address the user as "you".

Data:
- Readiness: ${Math.round(d.readiness)}/100 (${d.readinessWord}) — day type: ${d.dayType}
- ${hrvLine}
- ${rhrLine}
- ${sleepLine}
- Steps: ${d.steps === null ? "not available" : Math.round(d.steps).toLocaleString()}
- ${checkInLine}
- ${baselineLine}`;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "AI not configured. Add GEMINI_API_KEY to .env.local." },
      { status: 503 },
    );
  }

  let body: HealthInsightRequest;
  try {
    body = (await request.json()) as HealthInsightRequest;
    if (typeof body.readiness !== "number") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const model = getGeminiModel(HEALTH_SYSTEM_PROMPT);
    const prompt = buildHealthPrompt(body);
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return NextResponse.json({ interpretation: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
