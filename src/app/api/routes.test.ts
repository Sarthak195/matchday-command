import { beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { __resetRateLimits } from "@/lib/rate-limit";
import { POST as triage } from "./triage/route";
import { POST as demand } from "./demand/route";
import { POST as sim } from "./sim/route";
import { POST as tasks } from "./tasks/route";

beforeEach(() => __resetRateLimits());

/** Build a POST NextRequest; distinct `ip` isolates the rate-limiter per test. */
function post(path: string, body: unknown, ip: string): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("API route validation (short-circuits before any Gemini call)", () => {
  it("triage → 400 on invalid JSON", async () => {
    expect((await triage(post("/api/triage", "{not json", "v1"))).status).toBe(400);
  });

  it("demand → 400 when attendance is missing", async () => {
    const res = await demand(
      post("/api/demand", { minute: 10, phase: "kickoff", weather: {} }, "v2"),
    );
    expect(res.status).toBe(400);
  });

  it("sim → 400 on a non-finite tickMs", async () => {
    expect((await sim(post("/api/sim", { type: "speed" }, "v3"))).status).toBe(400);
  });

  it("sim → 400 on an unknown control type", async () => {
    expect((await sim(post("/api/sim", { type: "bogus" }, "v4"))).status).toBe(400);
  });

  it("tasks → 400 on an invalid role", async () => {
    const res = await tasks(post("/api/tasks", { role: "wizard", title: "t", detail: "d" }, "v5"));
    expect(res.status).toBe(400);
  });
});

describe("API rate limiting", () => {
  it("returns 429 once a client exceeds the per-route limit", async () => {
    const ip = "flooder";
    let status = 0;
    // demand allows 20/min; the limiter runs before body parsing, so even
    // malformed requests count. The 21st call must be blocked.
    for (let i = 0; i < 21; i++) {
      status = (await demand(post("/api/demand", {}, ip))).status;
    }
    expect(status).toBe(429);
  });
});
