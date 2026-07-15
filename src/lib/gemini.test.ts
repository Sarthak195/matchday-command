import { afterEach, describe, expect, it, vi } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import { generateJson, isRetryable, modelChain } from "./gemini";

afterEach(() => vi.unstubAllEnvs());

/** An SDK-style error whose message is the JSON blob Gemini returns. */
const gErr = (code: number) =>
  new Error(JSON.stringify({ error: { code, message: `err ${code}` } }));

/** Fake GoogleGenAI whose per-model outcome is scripted; records call order. */
function fakeClient(script: Record<string, { text?: string } | Error>) {
  const calls: string[] = [];
  const client = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        const outcome = script[model];
        if (outcome instanceof Error) throw outcome;
        return outcome ?? { text: "{}" };
      },
    },
  } as unknown as GoogleGenAI;
  return { client, calls };
}

const opts = { system: "s", prompt: "p", schema: {} };

describe("isRetryable", () => {
  it("treats 503/500/429 as retryable", () => {
    expect(isRetryable(gErr(503))).toBe(true);
    expect(isRetryable(gErr(500))).toBe(true);
    expect(isRetryable(gErr(429))).toBe(true);
  });

  it("treats client errors and non-JSON as non-retryable", () => {
    expect(isRetryable(gErr(400))).toBe(false);
    expect(isRetryable(gErr(404))).toBe(false);
    expect(isRetryable(new Error("network down"))).toBe(false);
  });
});

describe("modelChain", () => {
  it("puts the primary first, then de-duplicated fallbacks", () => {
    vi.stubEnv("GEMINI_MODEL", "primary");
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "primary, alt , alt, other");
    expect(modelChain()).toEqual(["primary", "alt", "other"]);
  });
});

describe("generateJson fallback", () => {
  it("falls back to the next model when the primary is overloaded", async () => {
    vi.stubEnv("GEMINI_MODEL", "a");
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "b");
    const { client, calls } = fakeClient({ a: gErr(503), b: { text: '{"ok":true}' } });
    const out = await generateJson<{ ok: boolean }>(opts, client);
    expect(out).toEqual({ ok: true });
    expect(calls).toEqual(["a", "b"]);
  });

  it("fails fast on a non-retryable error without trying fallbacks", async () => {
    vi.stubEnv("GEMINI_MODEL", "a");
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "b");
    const { client, calls } = fakeClient({ a: gErr(400), b: { text: "{}" } });
    await expect(generateJson(opts, client)).rejects.toThrow();
    expect(calls).toEqual(["a"]); // fallback never attempted
  });

  it("throws when every model in the chain is overloaded", async () => {
    vi.stubEnv("GEMINI_MODEL", "a");
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "b");
    const { client, calls } = fakeClient({ a: gErr(503), b: gErr(503) });
    await expect(generateJson(opts, client)).rejects.toThrow();
    expect(calls).toEqual(["a", "b"]);
  });

  it("succeeds on the primary without touching fallbacks", async () => {
    vi.stubEnv("GEMINI_MODEL", "a");
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "b");
    const { client, calls } = fakeClient({ a: { text: '{"n":1}' } });
    expect(await generateJson(opts, client)).toEqual({ n: 1 });
    expect(calls).toEqual(["a"]);
  });
});
