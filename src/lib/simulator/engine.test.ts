import { describe, expect, it } from "vitest";
import { SimulationEngine } from "./engine";

/** Run the sim for `minutes` ticks and capture the density signal (rng-driven). */
function densityTrace(seed: number, minutes = 90): number[] {
  const engine = new SimulationEngine(seed);
  const out: number[] = [];
  for (let i = 0; i < minutes; i++) {
    for (const ev of engine.tick()) {
      if (ev.type === "crowd-density") out.push(ev.densityPct);
    }
  }
  return out;
}

describe("SimulationEngine", () => {
  it("is deterministic for a fixed seed (same story every run)", () => {
    expect(densityTrace(42)).toEqual(densityTrace(42));
  });

  it("produces a different trace for a different seed", () => {
    expect(densityTrace(42)).not.toEqual(densityTrace(7));
  });

  it("advances one minute per tick and fills the venue over time", () => {
    const engine = new SimulationEngine();
    expect(engine.clockMinute).toBe(0);
    for (let i = 0; i < 90; i++) engine.tick();
    expect(engine.clockMinute).toBe(90);
    expect(engine.insideCount).toBeGreaterThan(0);
  });

  it("keeps every emitted density within 0..100", () => {
    for (const pct of densityTrace(42, 120)) {
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });
});
