/** Physical layout of a stadium: zones and gates. Shared by the simulator, API, and UI. */

export type ZoneKind = "gate" | "concourse" | "seating" | "concessions" | "medical" | "parking";

export interface Zone {
  id: string;
  name: string; // e.g. "North Concourse", "Block 12"
  kind: ZoneKind;
  /** Max safe number of people in the zone. Density % is derived from this. */
  capacity: number;
  gateIds: string[];
}

export interface Gate {
  id: string;
  name: string; // e.g. "Gate C"
  zoneId: string;
  /** Design throughput — entries per minute when fully staffed. */
  throughputPerMinute: number;
}

export interface Venue {
  id: string;
  name: string;
  city: string;
  capacity: number;
  zones: Zone[];
  gates: Gate[];
}
