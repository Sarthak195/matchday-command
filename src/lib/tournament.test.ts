import { describe, expect, it } from "vitest";
import { TOURNAMENT_VENUES, venueSummary } from "./tournament";

const live = TOURNAMENT_VENUES[0]; // Meridian Arena, offset 0
const early = TOURNAMENT_VENUES.find((v) => v.clockOffsetMin < 0)!; // a venue that kicks off later

describe("venueSummary", () => {
  it("is deterministic for the same shared minute", () => {
    expect(JSON.stringify(venueSummary(live, 75))).toBe(JSON.stringify(venueSummary(live, 75)));
  });

  it("maps the shared clock through the venue offset to a phase", () => {
    const s = venueSummary(live, 75); // m = 75 → first half
    expect(s.phase).toBe("kickoff");
    expect(s.phaseLabel).toBe("First half");
    expect(s.localMinute).toBe(75);
  });

  it("never reports a negative local minute for a not-yet-started venue", () => {
    const s = venueSummary(early, 0); // shared clock 0, negative offset → clamped
    expect(s.localMinute).toBeGreaterThanOrEqual(0);
    expect(s.insideEst).toBe(0); // nobody inside before gates
  });

  it("fills the bowl toward ~88% capacity by the time the match settles", () => {
    const s = venueSummary(live, 75); // fillFrac = 1
    expect(s.insideEst).toBe(Math.round(live.capacity * 0.88));
  });

  it("keeps density within a sane [0,97] band across the whole match day", () => {
    for (let m = -10; m <= 200; m += 5) {
      const s = venueSummary(live, m);
      expect(s.worstDensityPct).toBeGreaterThanOrEqual(0);
      expect(s.worstDensityPct).toBeLessThanOrEqual(97);
      expect(s.openIncidents).toBeGreaterThanOrEqual(0);
      expect(s.statusLine.length).toBeGreaterThan(0);
    }
  });

  it("reports no incidents in the first minutes after gates", () => {
    expect(venueSummary(live, 5).openIncidents).toBe(0);
  });
});
