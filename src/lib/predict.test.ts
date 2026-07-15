import { describe, expect, it } from "vitest";
import { computeWarnings } from "./predict";
import { DENSITY_ALERT_PCT, QUEUE_ALERT_LENGTH } from "@/shared/constants";
import type { CrowdDensityEvent, GateFlowEvent, StadiumEvent } from "@/shared/models";

let uid = 0;
const id = () => `ev-${uid++}`;

/** Client state stores events newest-first; helpers mirror that ordering. */
function zoneSeries(zoneId: string, points: Array<[number, number]>): CrowdDensityEvent[] {
  return points
    .map(([atMinute, densityPct]) => ({
      id: id(),
      atMinute,
      venueId: "meridian-arena",
      type: "crowd-density" as const,
      zoneId,
      occupancy: 0,
      densityPct,
    }))
    .reverse();
}
function gateQueueSeries(gateId: string, points: Array<[number, number]>): GateFlowEvent[] {
  return points
    .map(([atMinute, queueLength]) => ({
      id: id(),
      atMinute,
      venueId: "meridian-arena",
      type: "gate-flow" as const,
      gateId,
      entriesPerMinute: 120,
      queueLength,
    }))
    .reverse();
}

describe("computeWarnings — zone density projection", () => {
  it("warns when a zone is trending toward the alert threshold", () => {
    const events = zoneSeries("concourse-north", [[40, 70], [50, 80]]);
    const [w] = computeWarnings(events, 50);
    expect(w.kind).toBe("zone");
    expect(w.targetId).toBe("concourse-north");
    expect(w.threshold).toBe(DENSITY_ALERT_PCT);
    expect(w.etaMin).toBe(5); // (85-80)/1.0 per min
    expect(w.ratePerMin).toBeCloseTo(1.0);
  });

  it("does not warn about a zone that has already breached — that's an incident", () => {
    const events = zoneSeries("concourse-north", [[40, 80], [50, 90]]);
    expect(computeWarnings(events, 50)).toHaveLength(0);
  });

  it("does not warn on a flat or falling trend", () => {
    expect(computeWarnings(zoneSeries("concourse-north", [[40, 70], [50, 70]]), 50)).toHaveLength(0);
    expect(computeWarnings(zoneSeries("concourse-north", [[40, 80], [50, 70]]), 50)).toHaveLength(0);
  });

  it("suppresses breaches projected beyond the ETA horizon", () => {
    // +0.33%/min from 71 → ~42 min to hit 85, well past the 20-min horizon.
    expect(computeWarnings(zoneSeries("concourse-north", [[40, 70], [43, 71]]), 43)).toHaveLength(0);
  });

  it("needs at least two samples in the window to project", () => {
    expect(computeWarnings(zoneSeries("concourse-north", [[50, 80]]), 50)).toHaveLength(0);
  });

  it("skips gate-plaza zones — those are tracked via queue length", () => {
    const events = zoneSeries("gate-plaza-north", [[40, 70], [50, 80]]);
    expect(computeWarnings(events, 50)).toHaveLength(0);
  });
});

describe("computeWarnings — gate queue projection", () => {
  it("warns when a queue is climbing toward the alert length", () => {
    const events = gateQueueSeries("gate-a", [[40, 250], [44, 290]]);
    const [w] = computeWarnings(events, 44);
    expect(w.kind).toBe("gate");
    expect(w.targetId).toBe("gate-a");
    expect(w.threshold).toBe(QUEUE_ALERT_LENGTH);
    expect(w.etaMin).toBe(1); // (300-290)/10 per min
  });

  it("ignores a slowly growing queue below the rate floor", () => {
    // +2/min is under the 8/min minimum rate for a gate warning.
    expect(computeWarnings(gateQueueSeries("gate-a", [[40, 250], [50, 270]]), 50)).toHaveLength(0);
  });
});

describe("computeWarnings — ordering", () => {
  it("returns the most imminent warning first", () => {
    const events: StadiumEvent[] = [
      ...zoneSeries("concourse-north", [[40, 70], [50, 80]]), // eta ~5
      ...gateQueueSeries("gate-a", [[40, 250], [44, 290]]), // eta ~1
    ];
    const warnings = computeWarnings(events, 50);
    expect(warnings.map((w) => w.etaMin)).toEqual([...warnings.map((w) => w.etaMin)].sort((a, b) => a - b));
    expect(warnings[0].kind).toBe("gate");
  });
});
