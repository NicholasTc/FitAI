import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Returns a configured Gemini Flash model instance.
 * Created per-request so systemInstruction can vary per action.
 *
 * Requires GEMINI_API_KEY in .env.local.
 * Get one at: https://aistudio.google.com/apikey
 */
export function getGeminiModel(systemInstruction: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction,
    generationConfig: {
      temperature: 0.35, // low creativity — consistent coaching
      maxOutputTokens: 4096,
    },
  });
}

export const GEMINI_CONFIGURED = !!process.env.GEMINI_API_KEY;
