"use client";

import { useEffect, useReducer, useState } from "react";
import { CATCHUP_EVENT_COUNT, DEMO_VENUE } from "@/shared/constants";
import {
  nextPhase,
  type Incident,
  type MatchPhase,
  type StadiumEvent,
  type StreamMessage,
  type TriageResult,
} from "@/shared/models";

/** Accumulated match-day state, rebuilt on the client from the shared SSE feed.
 *  Used by the ops, staff, and tournament views via the useMatchStream hook. */
export interface DashState {
  minute: number;
  phase: MatchPhase;
  events: StadiumEvent[];
  incidents: Incident[];
  zones: Record<string, { occupancy: number; densityPct: number }>;
  gates: Record<string, { entriesPerMinute: number; queueLength: number }>;
}

const INITIAL: DashState = {
  minute: 0,
  phase: "gates-open",
  events: [],
  incidents: [],
  zones: {},
  gates: {},
};

export type DashAction =
  | { type: "reset" }
  | { type: "message"; msg: StreamMessage }
  | { type: "triage"; incidentId: string; triage: TriageResult }
  | { type: "status"; incidentId: string; status: Incident["status"] };

export function dashReducer(state: DashState, action: DashAction): DashState {
  switch (action.type) {
    case "reset":
      return INITIAL;
    case "triage":
      return {
        ...state,
        incidents: state.incidents.map((i) =>
          i.id === action.incidentId
            ? { ...i, triage: action.triage, severity: action.triage.severity }
            : i,
        ),
      };
    case "status":
      return {
        ...state,
        incidents: state.incidents.map((i) =>
          i.id === action.incidentId ? { ...i, status: action.status } : i,
        ),
      };
    case "message": {
      const msg = action.msg;
      if (msg.kind === "reset") return INITIAL;
      if (msg.kind === "clock") return { ...state, minute: msg.minute };
      if (msg.kind === "incident") {
        // Catch-up bursts can replay history — dedupe by id.
        if (state.incidents.some((i) => i.id === msg.incident.id)) return state;
        return { ...state, incidents: [msg.incident, ...state.incidents] };
      }
      if (msg.kind === "event") {
        const e = msg.event;
        if (state.events.some((x) => x.id === e.id)) return state;
        const next: DashState = {
          ...state,
          events: [e, ...state.events].slice(0, CATCHUP_EVENT_COUNT),
        };
        if (e.type === "match") next.phase = nextPhase(state.phase, e);
        if (e.type === "crowd-density") {
          next.zones = {
            ...state.zones,
            [e.zoneId]: { occupancy: e.occupancy, densityPct: e.densityPct },
          };
        }
        if (e.type === "gate-flow") {
          next.gates = {
            ...state.gates,
            [e.gateId]: { entriesPerMinute: e.entriesPerMinute, queueLength: e.queueLength },
          };
        }
        return next;
      }
      return state;
    }
  }
}

/**
 * Subscribes to THE shared match feed and reduces it into DashState. Every
 * view sees the same clock; sim controls are global via POST /api/sim.
 * On (re)connect the state resets and the server's catch-up burst rebuilds it.
 */
export function useMatchStream() {
  const [state, dispatch] = useReducer(dashReducer, INITIAL);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/stream");
    source.onopen = () => {
      setConnected(true);
      dispatch({ type: "reset" });
    };
    source.onerror = () => setConnected(false);
    source.onmessage = (raw) => {
      try {
        dispatch({ type: "message", msg: JSON.parse(raw.data) as StreamMessage });
      } catch {
        // skip malformed frame
      }
    };
    return () => source.close();
  }, [setConnected]);

  return { state, dispatch, connected };
}

/** Highest zone density across the live state (0 before any telemetry). Shared
 *  by the ops and tournament views so they never disagree on "worst zone". */
export function worstDensityPct(zones: DashState["zones"]): number {
  return Math.max(0, ...Object.values(zones).map((z) => z.densityPct));
}

/** Estimated fans inside = summed occupancy of seating + concourse zones.
 *  Keyed on the typed `Venue` model, not zone-id string matching. */
export function insideEstimate(zones: DashState["zones"]): number {
  return DEMO_VENUE.zones
    .filter((z) => z.kind === "seating" || z.kind === "concourse")
    .reduce((sum, z) => sum + (zones[z.id]?.occupancy ?? 0), 0);
}
