import type { Incident, StadiumEvent } from "@/shared/models";

/**
 * In-memory match-day state. Fine for the demo: Cloud Run runs a single
 * instance (set max-instances=1) and the simulation is ephemeral by design.
 * Swap for Firestore later if state must survive restarts.
 */
export interface OpsState {
  minute: number;
  events: StadiumEvent[];
  incidents: Incident[];
  zoneOccupancy: Record<string, number>;
}

const state: OpsState = {
  minute: 0,
  events: [],
  incidents: [],
  zoneOccupancy: {},
};

export function getState(): OpsState {
  return state;
}

export function resetState(): void {
  state.minute = 0;
  state.events = [];
  state.incidents = [];
  state.zoneOccupancy = {};
}
