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
You are FitAI, a personal recovery coach. The user trains 4–5x/week (strength + cardio).
Your job is to explain a single health metric using EXACTLY this format — no deviations:

What it means:
<1–2 sentences explaining what this specific metric value indicates today. Use the real numbers.>

Decision impact:
<1–2 sentences on how this signal affects today's Push / Maintain / Recover decision. Be specific about conditions that would change the call.>

Recommended action:
<1 concrete sentence on what the user should do with this signal today. Avoid vague advice.>

Confidence:
<Level> — <1 sentence explaining why the confidence is at that level, and what would increase it.>

Rules:
- Confidence level must be one of: High / Medium / Low
- Use the actual numbers from the data — never invent or estimate missing values
- If a value is "not available", acknowledge it honestly in the relevant section
- No medical claims or diagnoses
- Address the user as "you", never by name
- No markdown, no bullet points, no extra headers — only the four sections above`;

function buildExplainPrompt(metric: MetricKey, values: Record<string, number | string | null>): string {
  const v = (key: string) => values[key] ?? "not available";

  switch (metric) {
    case "sleep":
      return `Explain the user's sleep for today using the required format. Address the user as "you".

Data:
- Total sleep: ${v("sleepMinutes")} minutes (${v("sleepHours")}h ${v("sleepMins")}m)
- Deep: ${v("deepMin")}m, REM: ${v("remMin")}m, Light: ${v("lightMin")}m
- Sleep efficiency: ${v("efficiency")}%
- 7-day average: ${v("avgMinutes")} minutes
- Delta vs average: ${v("deltaMinutes")} minutes`;

    case "rhr":
      return `Explain the user's resting heart rate for today using the required format. Address the user as "you".

Data:
- Today's RHR: ${v("rhr")} bpm
- 7-day average: ${v("avgRhr")} bpm
- Delta: ${v("deltaRhr")} bpm (${Number(v("deltaRhr")) < 0 ? "lower than average — positive signal" : "higher than average — potential stress"})`;

    case "hrv":
      return `Explain the user's HRV for today using the required format. Address the user as "you".

Data:
- Today's HRV: ${v("hrv")} ms
- 7-day average: ${v("avgHrv")} ms
- Delta: ${v("deltaHrv")} ms (${Number(v("deltaHrv")) > 0 ? "above average — positive signal" : "below average — potential fatigue"})`;

    case "steps":
      return `Explain the user's step count in context using the required format. Address the user as "you".

Data:
- Steps so far today: ${v("steps")}
- 7-day average: ${v("avgSteps")}
- Current time: ${v("timeOfDay")}`;

    case "energy":
      return `Explain the user's subjective check-in values using the required format. Address the user as "you".

Data:
- Energy: ${v("energy")}/10
- Stress: ${v("stress")}/10
- Sleep quality (subjective): ${v("sleepQuality")}/10
- Motivation: ${v("motivation")}/10

Note: subjective signals take priority over wearable data when they conflict.`;
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
