import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.5-flash";
/** Models tried, in order, when the primary is unavailable. Overridable via env. */
const DEFAULT_FALLBACKS =
  "gemini-3-flash-preview,gemini-flash-latest,gemini-3.1-flash-lite,gemini-flash-lite-latest,gemini-2.0-flash";
/** Gemini status codes that mean "try another model": overloaded / transient / rate-limited. */
const RETRYABLE_CODES = new Set([429, 500, 503]);

export function getModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/** Primary model first, then de-duplicated fallbacks (env `GEMINI_FALLBACK_MODELS`). */
export function modelChain(): string[] {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? DEFAULT_FALLBACKS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([getModel(), ...fallbacks])];
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

/** Extract the numeric status code from an SDK error (often a JSON blob). */
function errorCode(err: unknown): number | undefined {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    return (JSON.parse(raw) as { error?: { code?: number } }).error?.code;
  } catch {
    return undefined;
  }
}

/** True when the error is a model-availability/transient one worth retrying on another model. */
export function isRetryable(err: unknown): boolean {
  const code = errorCode(err);
  return code !== undefined && RETRYABLE_CODES.has(code);
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
 * built with the `Type` enum from @google/genai). Every AI call in the app goes
 * through here so the model chain and the structured-output contract live in one
 * place. The primary model (GEMINI_MODEL) is tried first; on a transient/overload
 * error (503/500/429) it falls through to the fallback models rather than failing
 * the request. Non-retryable errors (bad key, invalid request) fail fast. The
 * `client` param is injectable for tests; production uses the shared client.
 */
export async function generateJson<T>(
  opts: {
    system: string;
    prompt: string;
    schema: object;
  },
  client: GoogleGenAI = getClient(),
): Promise<T> {
  const models = modelChain();
  let lastErr: unknown = new Error("No Gemini model configured");

  for (const model of models) {
    try {
      const res = await client.models.generateContent({
        model,
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
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error("Gemini returned malformed JSON");
      }
    } catch (err) {
      lastErr = err;
      // Only move to the next model on an overload/transient error; otherwise fail fast.
      if (isRetryable(err)) continue;
      throw err;
    }
  }
  // Every model was tried and each returned a retryable error.
  throw lastErr;
}
