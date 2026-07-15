import type { Venue } from "./models/venue";
import type { LatLng } from "./models/traffic";

/** Real-world coordinates the venue is pinned to (Indore) — used for the map
 *  center and the live weather lookup. */
export const VENUE_LOCATION: LatLng = { lat: 22.7243, lng: 75.8712 };

/** Density (% of zone capacity) at which a zone shows as "watch" on the dashboard. */
export const DENSITY_WATCH_PCT = 70;
/** Density at which a crowd incident is auto-opened. */
export const DENSITY_ALERT_PCT = 85;
/** Density at which an auto-opened crowd incident is rated high severity. */
export const DENSITY_CRITICAL_PCT = 92;
/** Gate queue length at which a gate incident is auto-opened. */
export const QUEUE_ALERT_LENGTH = 300;

/** Simulation pacing: one simulated minute per real tick (the "1×" speed). */
export const SIM_TICK_MS = 2000;
/** The "4×" fast-forward pacing offered in the sim-speed control. */
export const SIM_TICK_FAST_MS = 500;
/** Bounds the speed control clamps tick pacing to (ms per simulated minute). */
export const MIN_TICK_MS = 250;
export const MAX_TICK_MS = 10000;
/** Recent events replayed to a late joiner as a catch-up burst, and the number
 *  the client keeps in memory. Kept ≤ the server's event-log cap so the burst
 *  never asks for more history than is retained. */
export const CATCHUP_EVENT_COUNT = 250;
/** Kickoff happens this many simulated minutes after gates open. */
export const KICKOFF_MINUTE = 60;
/** Fans expected through the gates for the demo match (~88% of capacity). */
export const EXPECTED_ATTENDANCE = 46000;

/** Fictional demo venue — sized like a mid-tier international stadium. */
export const DEMO_VENUE: Venue = {
  id: "meridian-arena",
  name: "Meridian Arena",
  city: "Indore",
  capacity: 52000,
  zones: [
    {
      id: "gate-plaza-north",
      name: "North Gate Plaza",
      kind: "gate",
      capacity: 6000,
      gateIds: ["gate-a", "gate-b"],
    },
    {
      id: "gate-plaza-south",
      name: "South Gate Plaza",
      kind: "gate",
      capacity: 6000,
      gateIds: ["gate-c", "gate-d"],
    },
    {
      id: "concourse-north",
      name: "North Concourse",
      kind: "concourse",
      capacity: 9000,
      gateIds: [],
    },
    {
      id: "concourse-south",
      name: "South Concourse",
      kind: "concourse",
      capacity: 9000,
      gateIds: [],
    },
    { id: "seating-bowl", name: "Seating Bowl", kind: "seating", capacity: 52000, gateIds: [] },
    { id: "medical-bay", name: "Medical Bay", kind: "medical", capacity: 60, gateIds: [] },
  ],
  gates: [
    { id: "gate-a", name: "Gate A", zoneId: "gate-plaza-north", throughputPerMinute: 220 },
    { id: "gate-b", name: "Gate B", zoneId: "gate-plaza-north", throughputPerMinute: 220 },
    { id: "gate-c", name: "Gate C", zoneId: "gate-plaza-south", throughputPerMinute: 220 },
    { id: "gate-d", name: "Gate D", zoneId: "gate-plaza-south", throughputPerMinute: 180 },
  ],
};
