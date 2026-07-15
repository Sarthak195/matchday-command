import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimits, clientKey, rateLimit } from "./rate-limit";

beforeEach(() => __resetRateLimits());

const opts = { limit: 3, windowMs: 1000 };

describe("rateLimit", () => {
  it("allows requests up to the limit within a window", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", opts, 1000).ok).toBe(true);
  });

  it("blocks once the limit is exceeded and reports a retry delay", () => {
    for (let i = 0; i < 3; i++) rateLimit("k", opts, 1000);
    const blocked = rateLimit("k", opts, 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    for (let i = 0; i < 3; i++) rateLimit("k", opts, 1000);
    expect(rateLimit("k", opts, 1500).ok).toBe(false); // still inside window
    expect(rateLimit("k", opts, 2000).ok).toBe(true); // window reset at 2000
  });

  it("tracks distinct keys independently", () => {
    rateLimit("a", { limit: 1, windowMs: 1000 }, 1000);
    expect(rateLimit("a", { limit: 1, windowMs: 1000 }, 1000).ok).toBe(false);
    expect(rateLimit("b", { limit: 1, windowMs: 1000 }, 1000).ok).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first x-forwarded-for hop", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientKey(req)).toBe("1.2.3.4");
  });

  it("falls back to 'unknown' when the header is absent", () => {
    expect(clientKey(new Request("http://x"))).toBe("unknown");
  });
});
