import { describe, expect, it } from "vitest";
import { trafficAt } from "./model";

describe("trafficAt — structure", () => {
  it("returns the three fixed corridors and lots and echoes the minute", () => {
    const state = trafficAt(45, "gates-open");
    expect(state.atMinute).toBe(45);
    expect(state.corridors).toHaveLength(3);
    expect(state.lots).toHaveLength(3);
    expect(state.lots.every((l) => l.occupancy <= l.capacity)).toBe(true);
  });

  it("is deterministic for the same inputs", () => {
    expect(JSON.stringify(trafficAt(45, "gates-open"))).toBe(JSON.stringify(trafficAt(45, "gates-open")));
  });
});

describe("trafficAt — load curve", () => {
  it("peaks congestion during arrival, producing a severe corridor and a reroute advisory", () => {
    const state = trafficAt(45, "gates-open"); // ~15 min before kickoff = arrival peak
    expect(state.corridors.some((c) => c.congestion === "severe")).toBe(true);
    expect(state.advisories.some((a) => a.message.includes("congested"))).toBe(true);
  });

  it("goes quiet once the match is underway", () => {
    const state = trafficAt(90, "kickoff"); // inside the match, roads clear
    expect(state.corridors.every((c) => c.congestion === "clear")).toBe(true);
    expect(state.advisories).toHaveLength(0);
  });

  it("surges again at full time and adds an egress advisory", () => {
    const state = trafficAt(166, "fulltime");
    expect(state.corridors.some((c) => c.congestion === "severe" || c.congestion === "heavy")).toBe(true);
    const egress = state.advisories.find((a) => a.message.toLowerCase().includes("egress"));
    expect(egress?.severity).toBe("info");
  });
});

describe("trafficAt — seeding", () => {
  it("keeps ETAs positive integers and lets the seed vary them", () => {
    const a = trafficAt(45, "gates-open", 1);
    const b = trafficAt(45, "gates-open", 2);
    expect(a.corridors.every((c) => Number.isInteger(c.etaMin) && c.etaMin > 0)).toBe(true);
    // Same congestion levels but a different seed shifts the ETA jitter.
    expect(a.corridors.map((c) => c.etaMin)).not.toEqual(b.corridors.map((c) => c.etaMin));
  });
});
