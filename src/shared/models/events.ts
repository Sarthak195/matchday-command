/**
 * Everything that happens on match day is a StadiumEvent — a discriminated union
 * keyed on `type`. The simulator emits these, the ops store aggregates them, and
 * Gemini reads them as triage/briefing context. Add new signal sources here first.
 */

export type RadioChannel = "security" | "medical" | "facilities" | "stewarding";

/** Simulation clock: minutes since gates opened (kickoff is at minute 60). */
interface BaseEvent {
  id: string;
  atMinute: number;
  venueId: string;
}

export interface GateFlowEvent extends BaseEvent {
  type: "gate-flow";
  gateId: string;
  entriesPerMinute: number;
  queueLength: number;
}

export interface CrowdDensityEvent extends BaseEvent {
  type: "crowd-density";
  zoneId: string;
  occupancy: number;
  /** occupancy / zone capacity, as a percentage. */
  densityPct: number;
}

export interface RadioLogEvent extends BaseEvent {
  type: "radio-log";
  channel: RadioChannel;
  from: string; // e.g. "Steward 41"
  /** Free-text field report — this is what Gemini mines for early signals. */
  message: string;
}

export interface MedicalEvent extends BaseEvent {
  type: "medical";
  zoneId: string;
  description: string;
  severityHint?: "minor" | "serious" | "life-threatening";
}

export interface WeatherEvent extends BaseEvent {
  type: "weather";
  condition: "clear" | "rain" | "storm" | "heat";
  tempC: number;
  note?: string;
}

export type MatchPhase =
  "gates-open" | "kickoff" | "goal" | "halftime" | "second-half" | "fulltime";

export interface MatchEvent extends BaseEvent {
  type: "match";
  phase: MatchPhase;
  note?: string;
}

/**
 * Fold a match event into the running phase. `goal` is modeled as a transient
 * `MatchPhase` but must not overwrite the real phase (kickoff/second-half/…),
 * so it's held here in one place — the sim engine and the client reducer both
 * call this instead of re-deriving the rule.
 */
export function nextPhase(current: MatchPhase, event: MatchEvent): MatchPhase {
  return event.phase === "goal" ? current : event.phase;
}

export type StadiumEvent =
  GateFlowEvent | CrowdDensityEvent | RadioLogEvent | MedicalEvent | WeatherEvent | MatchEvent;

export type StadiumEventType = StadiumEvent["type"];
