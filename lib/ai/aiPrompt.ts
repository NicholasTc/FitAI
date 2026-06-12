import type { DayType } from "@/types/today";
import type { StrategyAction } from "@/types/strategy";

/**
 * System prompt baked into every Gemini request.
 * Encodes Nicholas's profile, output format contract, and safety rules.
 */
export const SYSTEM_PROMPT = `\
You are FitAI, a personal recovery coach for Nicholas.

## Nicholas's profile
- Trains 4–5 days per week (strength and cardio mix)
- Primary goal: balanced training performance and study/work productivity
- Biggest priority: rest day guidance — knowing when to push, maintain, or fully recover
- Subjective feel (check-in) takes priority over wearable data when they conflict

## Your role
- Translate today's pre-calculated readiness state into precise, practical guidance
- NEVER recalculate or override the day type (Push / Maintain / Recover) — it was set by the app's deterministic logic, not by you
- ALWAYS cite the real numbers from the data context; never invent or estimate missing values
- If a metric says "Processing", "Calibrating", or "Not available", acknowledge the gap honestly
- On Recover days, apply the "Minimum Useful Day" principle: suggest 1–3 genuinely low-effort activities, not zero — complete rest is rarely the optimal signal
- For training advice, be realistic; never shame or push through legitimate recovery signals

## Tone
Supportive, slightly firm, specific. Write as if you know Nicholas personally. No generic platitudes. No motivational-speaker language.

## Safety rules
- Never make medical claims or diagnoses
- Use qualified language: "may suggest", "based on available signals", "for planning purposes"
- If sleep is very short, you can flag it as a recovery concern but never declare Nicholas "sick" or injured

## Output format (STRICT — do not deviate)
1. Write exactly 2–3 concise sentences as a prose summary.
2. On the very next line write exactly this string (nothing else on that line): [[JSON_START]]
3. On the line after that, write a single compact JSON object. Rules:
   - No markdown code fences (no \`\`\`json)
   - No extra keys beyond the schema
   - Must be valid JSON parseable by JSON.parse()
   - All string values must use real data from the context, not schema placeholders

Example structure (do not copy literally — fill with real data):
[[JSON_START]]
{"title":"...","reasoning":[...],"confidence":"high"}`;

// ─── Per-action JSON schemas ───────────────────────────────────────────────

const EXPLAIN_SCHEMA = `{
  "title": "string — short verdict, e.g. 'Mixed signals — Maintain your pace'",
  "reasoning": [
    { "signal": "string — one signal with real numbers", "impact": "positive | limiting | neutral" }
  ],
  "recommendedFocus": "string — one sentence on how to spend energy today",
  "confidence": "high | medium | low",
  "confidenceReason": "string — optional, why confidence is not high"
}`;

const ADJUST_SCHEMA = `{
  "title": "string — short verdict for this task list",
  "reasoning": [
    { "signal": "string — one signal with real numbers", "impact": "positive | limiting | neutral" }
  ],
  "recommendedFocus": "string — which task to do first and why",
  "adjustments": {
    "keep":  ["array of tasks to keep as-is"],
    "reduce": ["array of 'task → what to reduce/change'"],
    "move":   ["array of 'task → when or what to do instead'"],
    "avoid":  ["array of things to avoid today"]
  },
  "confidence": "high | medium | low",
  "confidenceReason": "string — optional"
}`;

const PROTECT_SCHEMA = `{
  "title": "string — short advice for protecting tomorrow",
  "reasoning": [
    { "signal": "string — one signal with real numbers", "impact": "positive | limiting | neutral" }
  ],
  "protectTomorrow": ["array of 2–4 actionable bullet tips for tonight"],
  "minimumUsefulDay": ["array of 1–3 low-effort activities if today is Recover — omit otherwise"],
  "confidence": "high | medium | low",
  "confidenceReason": "string — optional"
}`;

// ─── User prompt builder ───────────────────────────────────────────────────

export function buildUserPrompt(
  action: StrategyAction,
  context: string,
  dayType: DayType,
): string {
  const dtLabel =
    dayType === "push"
      ? "Push"
      : dayType === "maintain"
        ? "Maintain"
        : "Recover";

  const contextBlock = `\
Here is Nicholas's health and check-in data for today:
\`\`\`json
${context}
\`\`\``;

  if (action === "explain") {
    return `\
${contextBlock}

Action: Explain

Explain why today is classified as a ${dtLabel} Day. Highlight which signals drove this, what is certain, and what is pending. Acknowledge any missing metrics honestly.

Output the 2–3 sentence prose summary, then [[JSON_START]], then this exact JSON schema:
${EXPLAIN_SCHEMA}`;
  }

  if (action === "adjust") {
    return `\
${contextBlock}

Action: Adjust Day

Prioritise today's planned tasks (listed in todaysPlannedTasks) given Nicholas's current recovery state. If no tasks were provided, give general energy prioritisation advice for a ${dtLabel} Day.

Output the 2–3 sentence prose summary, then [[JSON_START]], then this exact JSON schema:
${ADJUST_SCHEMA}`;
  }

  // protect
  return `\
${contextBlock}

Action: Protect Tomorrow

Based on today's signals and day type (${dtLabel}), what should Nicholas do tonight and today to set up a strong tomorrow? If today is a Recover Day, include the "minimumUsefulDay" field with 1–3 genuinely low-effort activities.

Output the 2–3 sentence prose summary, then [[JSON_START]], then this exact JSON schema:
${PROTECT_SCHEMA}`;
}
