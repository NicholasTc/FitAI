/**
 * POST /api/explain-metric
 *
 * Returns a short, targeted AI explanation for a single metric card.
 * Designed to be fast — no streaming, no JSON schema, plain prose only.
 */

import { auth } from "@/lib/auth";
import { getGeminiModel } from "@/lib/ai/gemini";
import { type NextRequest, NextResponse } from "next/server";

export type MetricKey = "sleep" | "rhr" | "hrv" | "steps" | "energy";

interface ExplainRequest {
  metric: MetricKey;
  values: Record<string, number | string | null>;
}

const METRIC_SYSTEM_PROMPT = `\
You are FitAI, a personal recovery coach for Nicholas (trains 4–5x/week, strength + cardio).
Your job is to explain a single health metric in 2–3 concise sentences.

Rules:
- Use the actual numbers provided — never invent values
- Be direct and specific, not generic
- End with one practical implication for today
- No medical claims, no diagnoses
- Do NOT start with "Your" or repeat the metric name in the first word
- Max 60 words total`;

function buildExplainPrompt(metric: MetricKey, values: Record<string, number | string | null>): string {
  const v = (key: string) => values[key] ?? "not available";

  switch (metric) {
    case "sleep":
      return `Explain Nicholas's sleep metric for today:
- Total sleep: ${v("sleepMinutes")} minutes (${v("sleepHours")}h ${v("sleepMins")}m)
- Deep: ${v("deepMin")}m, REM: ${v("remMin")}m, Light: ${v("lightMin")}m
- Sleep efficiency: ${v("efficiency")}%
- 7-day average: ${v("avgMinutes")} minutes
- Delta vs average: ${v("deltaMinutes")} minutes

What does this mean for today's energy and recovery?`;

    case "rhr":
      return `Explain Nicholas's resting heart rate for today:
- Today's RHR: ${v("rhr")} bpm
- 7-day average: ${v("avgRhr")} bpm
- Delta: ${v("deltaRhr")} bpm (${Number(v("deltaRhr")) < 0 ? "lower than avg" : "higher than avg"})

What does this signal about his current recovery state?`;

    case "hrv":
      return `Explain Nicholas's HRV for today:
- Today's HRV: ${v("hrv")} ms
- 7-day average: ${v("avgHrv")} ms
- Delta: ${v("deltaHrv")} ms (${Number(v("deltaHrv")) > 0 ? "above avg" : "below avg"})

What does HRV indicate about his nervous system readiness today?`;

    case "steps":
      return `Explain Nicholas's step count in context:
- Steps so far today: ${v("steps")}
- 7-day average: ${v("avgSteps")}
- It is currently ${v("timeOfDay")}

What does this step count suggest about today's activity level?`;

    case "energy":
      return `Explain Nicholas's subjective check-in values:
- Energy: ${v("energy")}/10
- Stress: ${v("stress")}/10
- Sleep quality (subjective): ${v("sleepQuality")}/10
- Motivation: ${v("motivation")}/10

What do these subjective signals mean for how he should approach today?`;
  }
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

  let metric: MetricKey;
  let values: Record<string, number | string | null>;

  try {
    const body = (await request.json()) as Partial<ExplainRequest>;
    const validMetrics: MetricKey[] = ["sleep", "rhr", "hrv", "steps", "energy"];
    if (!body.metric || !validMetrics.includes(body.metric)) {
      return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
    }
    metric = body.metric;
    values = body.values ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const model = getGeminiModel(METRIC_SYSTEM_PROMPT);
    const prompt = buildExplainPrompt(metric, values);
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    return NextResponse.json({ explanation: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
