import type { StadiumEvent } from "./events";
import type { Incident } from "./incident";
import type { Venue } from "./venue";

/**
 * Wire protocol for the live SSE feed (`GET /api/stream`). Every SSE `data:` line
 * is one JSON-encoded StreamMessage. The dashboard switches on `kind`.
 */

export interface OpsSnapshot {
  minute: number;
  venue: Venue;
  /** zoneId -> current occupancy. */
  zoneOccupancy: Record<string, number>;
  incidents: Incident[];
  recentEvents: StadiumEvent[];
}

export type StreamMessage =
  | { kind: "clock"; minute: number }
  | { kind: "event"; event: StadiumEvent }
  | { kind: "incident"; incident: Incident }
  | { kind: "snapshot"; state: OpsSnapshot };
