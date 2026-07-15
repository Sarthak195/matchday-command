import { describe, expect, it } from "vitest";
import { nextPhase, type MatchEvent } from "./index";

const matchEvent = (phase: MatchEvent["phase"]): MatchEvent => ({
  type: "match",
  id: "m1",
  venueId: "meridian-arena",
  atMinute: 60,
  phase,
});

describe("nextPhase", () => {
  it("adopts the event phase for real transitions", () => {
    expect(nextPhase("gates-open", matchEvent("kickoff"))).toBe("kickoff");
    expect(nextPhase("kickoff", matchEvent("halftime"))).toBe("halftime");
    expect(nextPhase("halftime", matchEvent("second-half"))).toBe("second-half");
    expect(nextPhase("second-half", matchEvent("fulltime"))).toBe("fulltime");
  });

  it("keeps the running phase for a transient goal event", () => {
    expect(nextPhase("kickoff", matchEvent("goal"))).toBe("kickoff");
    expect(nextPhase("second-half", matchEvent("goal"))).toBe("second-half");
  });
});
