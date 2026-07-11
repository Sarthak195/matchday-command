"use client";

import { useEffect, useReducer } from "react";
import type { Incident, MatchPhase, StadiumEvent, StreamMessage, TriageResult } from "@/shared/models";

/** Accumulated match-day state, rebuilt on the client from the SSE feed. Shared
 *  by the ops and staff dashboards via the useMatchStream hook. */
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
      if (msg.kind === "clock") return { ...state, minute: msg.minute };
      if (msg.kind === "incident") return { ...state, incidents: [msg.incident, ...state.incidents] };
      if (msg.kind === "event") {
        const e = msg.event;
        const next: DashState = { ...state, events: [e, ...state.events].slice(0, 250) };
        if (e.type === "match") next.phase = e.phase === "goal" ? state.phase : e.phase;
        if (e.type === "crowd-density") {
          next.zones = { ...state.zones, [e.zoneId]: { occupancy: e.occupancy, densityPct: e.densityPct } };
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
 * Opens an SSE connection to the match-day feed and reduces it into DashState.
 * Reconnecting with a new tickMs/startMinute restarts the deterministic sim.
 */
export function useMatchStream(tickMs: number, startMinute: number) {
  const [state, dispatch] = useReducer(dashReducer, INITIAL);
  const [connected, setConnected] = useReducerConnected();

  useEffect(() => {
    dispatch({ type: "reset" });
    const source = new EventSource(`/api/stream?tickMs=${tickMs}&startMinute=${startMinute}`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (raw) => {
      try {
        dispatch({ type: "message", msg: JSON.parse(raw.data) as StreamMessage });
      } catch {
        // skip malformed frame
      }
    };
    return () => source.close();
  }, [tickMs, startMinute, setConnected]);

  return { state, dispatch, connected };
}

/** Tiny boolean reducer kept separate so the connection flag doesn't churn state. */
function useReducerConnected() {
  return useReducer((_: boolean, v: boolean) => v, false) as [boolean, (v: boolean) => void];
}
