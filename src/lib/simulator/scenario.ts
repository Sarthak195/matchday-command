import type { StadiumEvent } from "@/shared/models";

/** Omit that distributes over a union, so drafts keep their discriminant. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A scenario event before the engine stamps it with an id and venue. */
export type EventDraft = DistributiveOmit<StadiumEvent, "id" | "venueId">;

export interface ScenarioBeat {
  atMinute: number;
  events: EventDraft[];
}

/**
 * Scripted match-day storyline (clock = minutes since gates open, kickoff at 60).
 * The engine layers baseline gate-flow/density noise on top of these beats.
 * This is the demo script — tune it so each AI feature gets a moment to shine.
 */
export const SCENARIO: ScenarioBeat[] = [
  {
    atMinute: 0,
    events: [{ type: "match", atMinute: 0, phase: "gates-open", note: "Gates open, 52k expected" }],
  },
  {
    atMinute: 28,
    events: [
      { type: "gate-flow", atMinute: 28, gateId: "gate-c", entriesPerMinute: 90, queueLength: 420 },
      {
        type: "radio-log",
        atMinute: 28,
        channel: "stewarding",
        from: "Steward 41",
        message: "Gate C scanners running slow, queue backing up toward the metro exit",
      },
    ],
  },
  {
    atMinute: 41,
    events: [{ type: "crowd-density", atMinute: 41, zoneId: "concourse-north", occupancy: 8000, densityPct: 89 }],
  },
  {
    atMinute: 60,
    events: [{ type: "match", atMinute: 60, phase: "kickoff" }],
  },
  {
    atMinute: 68,
    events: [
      {
        type: "medical",
        atMinute: 68,
        zoneId: "seating-bowl",
        description: "Spectator collapsed in Block 12, upper tier",
        severityHint: "serious",
      },
    ],
  },
  {
    atMinute: 75,
    events: [
      { type: "weather", atMinute: 75, condition: "storm", tempC: 31, note: "Storm cell 20km west, moving in" },
      {
        type: "radio-log",
        atMinute: 75,
        channel: "facilities",
        from: "Roof Ops",
        message: "Wind picking up on the west stand, checking hoardings",
      },
    ],
  },
  {
    atMinute: 105,
    events: [{ type: "match", atMinute: 105, phase: "halftime" }],
  },
];
