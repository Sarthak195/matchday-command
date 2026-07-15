import type { StadiumEvent } from "./events";
import type { Incident } from "./incident";
import type { Venue } from "./venue";

/**
 * Wire protocol for the live SSE feed (`GET /api/stream`). Every SSE `data:` line
 * is one JSON-encoded StreamMessage. The dashboard switches on `kind`.
 */

/** Reserved: a full-state snapshot variant. Not emitted yet — the server only
 *  sends incremental clock/event/incident frames plus a catch-up replay, so
 *  `dashReducer` deliberately has no `snapshot` branch. Kept in the protocol so
 *  the wire format can add it without a breaking change. */
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
  /** Reserved — see OpsSnapshot; not currently emitted. */
  | { kind: "snapshot"; state: OpsSnapshot }
  /** The shared match was restarted — clients must drop accumulated state. */
  | { kind: "reset" };
