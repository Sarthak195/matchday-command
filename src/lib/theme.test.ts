import { describe, expect, it } from "vitest";
import {
  CONGESTION_COLOR,
  CRITICAL_TEXT,
  PHASE_LABEL,
  SEVERITY_META,
  STATUS,
  densityState,
} from "./theme";

describe("densityState", () => {
  it("labels each density band by threshold", () => {
    expect(densityState(95).label).toBe("Critical");
    expect(densityState(88).label).toBe("Alert");
    expect(densityState(75).label).toBe("Watch");
    expect(densityState(40).label).toBe("OK");
  });

  it("uses the accessible critical-text color for critical density", () => {
    expect(densityState(95).color).toBe(CRITICAL_TEXT);
    expect(densityState(40).color).toBe(STATUS.good);
  });
});

describe("PHASE_LABEL", () => {
  it("maps the transient goal phase to the same label as kickoff", () => {
    expect(PHASE_LABEL.goal).toBe(PHASE_LABEL.kickoff);
  });
});

describe("SEVERITY_META", () => {
  it("covers every severity with a non-empty label and a color", () => {
    for (const sev of ["info", "low", "medium", "high", "critical"] as const) {
      expect(SEVERITY_META[sev].label.length).toBeGreaterThan(0);
      expect(SEVERITY_META[sev].color).toMatch(/^#/);
    }
  });
});

describe("CONGESTION_COLOR", () => {
  it("maps all four congestion levels", () => {
    expect(Object.keys(CONGESTION_COLOR).sort()).toEqual(["clear", "heavy", "moderate", "severe"]);
  });
});
