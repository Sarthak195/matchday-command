import { describe, expect, it } from "vitest";
import { IncidentDetector } from "./detector";
import {
  DENSITY_ALERT_PCT,
  DENSITY_CRITICAL_PCT,
  QUEUE_ALERT_LENGTH,
} from "@/shared/constants";
import type {
  CrowdDensityEvent,
  GateFlowEvent,
  MedicalEvent,
  RadioLogEvent,
  WeatherEvent,
} from "@/shared/models";

let uid = 0;
const nextId = () => `ev-${uid++}`;
const base = () => ({ id: nextId(), atMinute: 30, venueId: "meridian-arena" });

function density(zoneId: string, densityPct: number): CrowdDensityEvent {
  return { ...base(), type: "crowd-density", zoneId, occupancy: 0, densityPct };
}
function gate(gateId: string, queueLength: number): GateFlowEvent {
  return { ...base(), type: "gate-flow", gateId, entriesPerMinute: 100, queueLength };
}
function medical(hint?: MedicalEvent["severityHint"]): MedicalEvent {
  return { ...base(), type: "medical", zoneId: "seating-bowl", description: "fainting", severityHint: hint };
}
function weather(condition: WeatherEvent["condition"]): WeatherEvent {
  return { ...base(), type: "weather", condition, tempC: 30 };
}

describe("IncidentDetector — crowd density rules", () => {
  it("opens no incident below the alert threshold", () => {
    const d = new IncidentDetector();
    expect(d.process([density("concourse-north", DENSITY_ALERT_PCT - 1)], 30)).toHaveLength(0);
  });

  it("opens a medium incident at the alert threshold", () => {
    const d = new IncidentDetector();
    const [inc] = d.process([density("concourse-north", DENSITY_ALERT_PCT)], 30);
    expect(inc.severity).toBe("medium");
    expect(inc.category).toBe("crowd");
    expect(inc.status).toBe("open");
    expect(inc.zoneId).toBe("concourse-north");
    expect(inc.title).toContain("North Concourse"); // human zone name, not the id
  });

  it("escalates to high severity at the critical threshold", () => {
    const d = new IncidentDetector();
    const [inc] = d.process([density("concourse-south", DENSITY_CRITICAL_PCT)], 30);
    expect(inc.severity).toBe("high");
  });

  it("dedupes an ongoing situation across telemetry cycles", () => {
    const d = new IncidentDetector();
    const first = d.process([density("concourse-north", 90)], 30);
    const second = d.process([density("concourse-north", 94)], 31);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0); // same zone key — no duplicate incident
  });

  it("opens separate incidents for different zones", () => {
    const d = new IncidentDetector();
    const found = d.process([density("concourse-north", 90), density("concourse-south", 90)], 30);
    expect(found).toHaveLength(2);
  });
});

describe("IncidentDetector — gate queue rules", () => {
  it("ignores queues under the alert length", () => {
    const d = new IncidentDetector();
    expect(d.process([gate("gate-a", QUEUE_ALERT_LENGTH - 1)], 30)).toHaveLength(0);
  });

  it("opens a gate incident and resolves the gate's zone", () => {
    const d = new IncidentDetector();
    const [inc] = d.process([gate("gate-a", QUEUE_ALERT_LENGTH)], 30);
    expect(inc.category).toBe("crowd");
    expect(inc.severity).toBe("medium");
    expect(inc.zoneId).toBe("gate-plaza-north"); // gate-a belongs to the north plaza
    expect(inc.title).toContain("Gate A");
  });
});

describe("IncidentDetector — medical rules", () => {
  it("maps severity hints onto incident severity", () => {
    expect(new IncidentDetector().process([medical("life-threatening")], 30)[0].severity).toBe("critical");
    expect(new IncidentDetector().process([medical("serious")], 30)[0].severity).toBe("high");
    expect(new IncidentDetector().process([medical("minor")], 30)[0].severity).toBe("medium");
    expect(new IncidentDetector().process([medical(undefined)], 30)[0].severity).toBe("medium");
  });

  it("does not dedupe medical events — every call for help is its own incident", () => {
    const d = new IncidentDetector();
    const found = d.process([medical("serious"), medical("serious")], 30);
    expect(found).toHaveLength(2);
  });
});

describe("IncidentDetector — weather rules", () => {
  it("opens an incident only for storms", () => {
    expect(new IncidentDetector().process([weather("storm")], 30)).toHaveLength(1);
    expect(new IncidentDetector().process([weather("rain")], 30)).toHaveLength(0);
    expect(new IncidentDetector().process([weather("heat")], 30)).toHaveLength(0);
  });
});

describe("IncidentDetector — non-triggering signals", () => {
  it("ignores radio logs and match events", () => {
    const d = new IncidentDetector();
    const radio: RadioLogEvent = {
      ...base(),
      type: "radio-log",
      channel: "security",
      from: "Steward 41",
      message: "all quiet at Gate A",
    };
    expect(d.process([radio], 30)).toHaveLength(0);
  });

  it("issues monotonically increasing incident ids", () => {
    const d = new IncidentDetector();
    const a = d.process([density("concourse-north", 90)], 30)[0];
    const b = d.process([density("concourse-south", 90)], 30)[0];
    expect(a.id).toBe("inc-0");
    expect(b.id).toBe("inc-1");
  });

  it("stamps the incident with the current sim minute", () => {
    const d = new IncidentDetector();
    const [inc] = d.process([density("concourse-north", 90)], 77);
    expect(inc.createdAtMinute).toBe(77);
  });
});
