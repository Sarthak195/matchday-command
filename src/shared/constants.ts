import type { Venue } from "./models/venue";

/** Density (% of zone capacity) at which a zone shows as "watch" on the dashboard. */
export const DENSITY_WATCH_PCT = 70;
/** Density at which a crowd incident is auto-opened. */
export const DENSITY_ALERT_PCT = 85;

/** Simulation pacing: one simulated minute per real tick. */
export const SIM_TICK_MS = 2000;
/** Kickoff happens this many simulated minutes after gates open. */
export const KICKOFF_MINUTE = 60;

/** Fictional demo venue — sized like a mid-tier international stadium. */
export const DEMO_VENUE: Venue = {
  id: "meridian-arena",
  name: "Meridian Arena",
  city: "Indore",
  capacity: 52000,
  zones: [
    { id: "gate-plaza-north", name: "North Gate Plaza", kind: "gate", capacity: 6000, gateIds: ["gate-a", "gate-b"] },
    { id: "gate-plaza-south", name: "South Gate Plaza", kind: "gate", capacity: 6000, gateIds: ["gate-c", "gate-d"] },
    { id: "concourse-north", name: "North Concourse", kind: "concourse", capacity: 9000, gateIds: [] },
    { id: "concourse-south", name: "South Concourse", kind: "concourse", capacity: 9000, gateIds: [] },
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
