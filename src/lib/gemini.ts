import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.5-flash";

export function getModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

let client: GoogleGenAI | null = null;

export function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set — copy .env.example to .env.local and add your key");
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** Turn SDK errors (often raw JSON blobs) into a line fit for the UI. */
export function geminiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number; message?: string } };
    const code = parsed.error?.code;
    if (code === 503) return "Gemini is briefly overloaded — try again in a few seconds.";
    if (code === 429) return "Gemini rate limit reached — wait a moment and retry.";
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // not JSON — fall through
  }
  return raw;
}

/**
 * Ask Gemini for a JSON object matching `schema` (Gemini structured-output schema,
 * built with the `Type` enum from @google/genai). All AI calls in the app go
 * through here so model choice, error handling, and logging live in one place.
 */
export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  schema: object;
}): Promise<T> {
  const ai = getClient();
  const res = await ai.models.generateContent({
    model: getModel(),
    contents: opts.prompt,
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseSchema: opts.schema,
    },
  });
  const text = res.text;
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }
  return JSON.parse(text) as T;
}
