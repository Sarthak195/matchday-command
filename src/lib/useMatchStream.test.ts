import { describe, expect, it } from "vitest";
import { dashReducer, insideEstimate, worstDensityPct, type DashState } from "./useMatchStream";
import type { CrowdDensityEvent, GateFlowEvent, Incident, MatchEvent } from "@/shared/models";

const INITIAL = dashReducer({} as DashState, { type: "reset" });

const density = (id: string, zoneId: string, densityPct: number, occupancy = 0): CrowdDensityEvent => ({
  type: "crowd-density",
  id,
  venueId: "meridian-arena",
  atMinute: 10,
  zoneId,
  occupancy,
  densityPct,
});

const gateFlow = (id: string, gateId: string, queueLength: number): GateFlowEvent => ({
  type: "gate-flow",
  id,
  venueId: "meridian-arena",
  atMinute: 10,
  gateId,
  entriesPerMinute: 120,
  queueLength,
});

const incident = (id: string): Incident => ({
  id,
  createdAtMinute: 10,
  title: "Crowd density",
  category: "crowd",
  severity: "medium",
  status: "open",
  sourceEventIds: [],
});

describe("dashReducer", () => {
  it("resets to the initial state", () => {
    const dirty: DashState = { ...INITIAL, minute: 99, events: [density("e1", "z", 80)] };
    expect(dashReducer(dirty, { type: "reset" })).toEqual(INITIAL);
    expect(dashReducer(dirty, { type: "message", msg: { kind: "reset" } })).toEqual(INITIAL);
  });

  it("advances the clock", () => {
    const s = dashReducer(INITIAL, { type: "message", msg: { kind: "clock", minute: 42 } });
    expect(s.minute).toBe(42);
  });

  it("projects a crowd-density event into the zones map", () => {
    const s = dashReducer(INITIAL, {
      type: "message",
      msg: { kind: "event", event: density("e1", "concourse-north", 77, 6900) },
    });
    expect(s.zones["concourse-north"]).toEqual({ occupancy: 6900, densityPct: 77 });
    expect(s.events).toHaveLength(1);
  });

  it("projects a gate-flow event into the gates map", () => {
    const s = dashReducer(INITIAL, {
      type: "message",
      msg: { kind: "event", event: gateFlow("e1", "gate-a", 310) },
    });
    expect(s.gates["gate-a"]).toEqual({ entriesPerMinute: 120, queueLength: 310 });
  });

  it("dedupes events by id (catch-up replay is idempotent)", () => {
    const once = dashReducer(INITIAL, {
      type: "message",
      msg: { kind: "event", event: density("dup", "seating-bowl", 50) },
    });
    const twice = dashReducer(once, {
      type: "message",
      msg: { kind: "event", event: density("dup", "seating-bowl", 50) },
    });
    expect(twice.events).toHaveLength(1);
  });

  it("keeps the phase on a goal but advances it on a real transition", () => {
    const match = (phase: MatchEvent["phase"]): MatchEvent => ({
      type: "match",
      id: `m-${phase}`,
      venueId: "meridian-arena",
      atMinute: 60,
      phase,
    });
    const kicked = dashReducer(INITIAL, { type: "message", msg: { kind: "event", event: match("kickoff") } });
    expect(kicked.phase).toBe("kickoff");
    const afterGoal = dashReducer(kicked, { type: "message", msg: { kind: "event", event: match("goal") } });
    expect(afterGoal.phase).toBe("kickoff");
  });

  it("prepends incidents and dedupes them by id", () => {
    const one = dashReducer(INITIAL, { type: "message", msg: { kind: "incident", incident: incident("i1") } });
    const two = dashReducer(one, { type: "message", msg: { kind: "incident", incident: incident("i2") } });
    expect(two.incidents.map((i) => i.id)).toEqual(["i2", "i1"]);
    const dup = dashReducer(two, { type: "message", msg: { kind: "incident", incident: incident("i2") } });
    expect(dup.incidents).toHaveLength(2);
  });

  it("applies triage to the matching incident and lifts its severity", () => {
    const withIncident = dashReducer(INITIAL, {
      type: "message",
      msg: { kind: "incident", incident: incident("i1") },
    });
    const s = dashReducer(withIncident, {
      type: "triage",
      incidentId: "i1",
      triage: {
        summary: "s",
        severity: "high",
        rationale: "r",
        recommendedActions: [],
        escalate: false,
      },
    });
    expect(s.incidents[0].severity).toBe("high");
    expect(s.incidents[0].triage?.summary).toBe("s");
  });

  it("updates an incident's status", () => {
    const withIncident = dashReducer(INITIAL, {
      type: "message",
      msg: { kind: "incident", incident: incident("i1") },
    });
    const s = dashReducer(withIncident, { type: "status", incidentId: "i1", status: "resolved" });
    expect(s.incidents[0].status).toBe("resolved");
  });
});

describe("worstDensityPct", () => {
  it("returns 0 with no telemetry", () => {
    expect(worstDensityPct({})).toBe(0);
  });

  it("returns the highest zone density", () => {
    expect(
      worstDensityPct({
        a: { occupancy: 0, densityPct: 70 },
        b: { occupancy: 0, densityPct: 88 },
      }),
    ).toBe(88);
  });
});

describe("insideEstimate", () => {
  it("sums seating + concourse occupancy and ignores gate plazas", () => {
    const inside = insideEstimate({
      "concourse-north": { occupancy: 100, densityPct: 0 },
      "concourse-south": { occupancy: 150, densityPct: 0 },
      "seating-bowl": { occupancy: 200, densityPct: 0 },
      "gate-plaza-north": { occupancy: 999, densityPct: 0 },
    });
    expect(inside).toBe(450);
  });
});
