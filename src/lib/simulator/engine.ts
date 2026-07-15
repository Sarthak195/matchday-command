import { DEMO_VENUE, EXPECTED_ATTENDANCE, KICKOFF_MINUTE } from "@/shared/constants";
import { nextPhase, type MatchPhase, type StadiumEvent } from "@/shared/models";
import { SCENARIO } from "./scenario";

/** How long a scripted density override lingers before decaying back to model. */
const DENSITY_OVERRIDE_DECAY_MIN = 12;

interface GateState {
  queueLength: number;
  entriesPerMinute: number;
}

/** Deterministic PRNG (LCG) so every run of the demo tells the same story. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Tick-based match-day simulator. Each tick advances the clock one simulated
 * minute and returns that minute's events: scripted scenario beats plus baseline
 * gate-flow and crowd-density noise, so anomalies stand out against a live pulse.
 * Scripted gate/density values are folded into internal state and decay naturally.
 */
export class SimulationEngine {
  private minute = 0;
  private seq = 0;
  private rng: () => number;
  private inside = 0;
  private phase: MatchPhase = "gates-open";
  private gates = new Map<string, GateState>();
  /** Scripted density overrides: zoneId -> { pct, untilMinute }. */
  private densityOverrides = new Map<string, { pct: number; until: number }>();

  constructor(seed = 42) {
    this.rng = makeRng(seed);
    for (const gate of DEMO_VENUE.gates) {
      this.gates.set(gate.id, { queueLength: 0, entriesPerMinute: 0 });
    }
  }

  get clockMinute(): number {
    return this.minute;
  }

  get insideCount(): number {
    return this.inside;
  }

  tick(): StadiumEvent[] {
    const events: StadiumEvent[] = [];

    // 1. Scripted beats fire first and steer internal state.
    for (const beat of SCENARIO.filter((b) => b.atMinute === this.minute)) {
      for (const draft of beat.events) {
        const event = { ...draft, id: this.nextId(), venueId: DEMO_VENUE.id } as StadiumEvent;
        events.push(event);
        this.applyScripted(event);
      }
    }

    // 2. Baseline arrivals: bell-ish curve peaking ~20 min before kickoff.
    const arrivals = this.arrivalsThisMinute();
    const gateList = DEMO_VENUE.gates;
    const totalThroughput = gateList.reduce((sum, g) => sum + g.throughputPerMinute, 0);
    for (const gate of gateList) {
      const state = this.gates.get(gate.id)!;
      const share = gate.throughputPerMinute / totalThroughput;
      const inflow = Math.round(arrivals * share * (0.85 + this.rng() * 0.3));
      const processed = Math.min(state.queueLength + inflow, gate.throughputPerMinute);
      state.queueLength = Math.max(0, state.queueLength + inflow - processed);
      state.entriesPerMinute = processed;
      this.inside = Math.min(this.inside + processed, EXPECTED_ATTENDANCE);
    }

    // 3. Periodic telemetry emissions (staggered so the feed breathes).
    if (this.minute % 5 === 2) {
      for (const gate of gateList) {
        const state = this.gates.get(gate.id)!;
        events.push({
          type: "gate-flow",
          id: this.nextId(),
          venueId: DEMO_VENUE.id,
          atMinute: this.minute,
          gateId: gate.id,
          entriesPerMinute: state.entriesPerMinute,
          queueLength: state.queueLength,
        });
      }
    }
    if (this.minute % 5 === 4) {
      for (const zone of DEMO_VENUE.zones.filter((z) => z.kind !== "medical")) {
        const occupancy = this.zoneOccupancy(zone.id);
        events.push({
          type: "crowd-density",
          id: this.nextId(),
          venueId: DEMO_VENUE.id,
          atMinute: this.minute,
          zoneId: zone.id,
          occupancy,
          densityPct: Math.min(100, Math.round((occupancy / this.zoneCapacity(zone.id)) * 100)),
        });
      }
    }

    this.minute += 1;
    return events;
  }

  private nextId(): string {
    return `evt-${this.seq++}`;
  }

  private applyScripted(event: StadiumEvent): void {
    switch (event.type) {
      case "match":
        this.phase = nextPhase(this.phase, event);
        break;
      case "gate-flow": {
        const state = this.gates.get(event.gateId);
        if (state) {
          state.queueLength = event.queueLength;
          state.entriesPerMinute = event.entriesPerMinute;
        }
        break;
      }
      case "crowd-density":
        this.densityOverrides.set(event.zoneId, {
          pct: event.densityPct,
          until: this.minute + DENSITY_OVERRIDE_DECAY_MIN,
        });
        break;
      default:
        break;
    }
  }

  /** Fans arriving at the venue this minute (before queueing at gates). */
  private arrivalsThisMinute(): number {
    if (this.phase === "fulltime") return 0;
    const peak = KICKOFF_MINUTE - 20;
    const spread = 22;
    const x = (this.minute - peak) / spread;
    const curve = Math.exp(-x * x); // gaussian bump
    const remaining = EXPECTED_ATTENDANCE - this.inside;
    if (remaining <= 0) return 0;
    const base = (EXPECTED_ATTENDANCE / (spread * 2.5)) * curve;
    return Math.min(remaining, Math.round(base * (0.9 + this.rng() * 0.2)));
  }

  private zoneCapacity(zoneId: string): number {
    return DEMO_VENUE.zones.find((z) => z.id === zoneId)?.capacity ?? 1;
  }

  /** Occupancy per zone: gate plazas hold queues, concourses hold a phase-dependent share. */
  private zoneOccupancy(zoneId: string): number {
    const override = this.densityOverrides.get(zoneId);
    if (override && this.minute <= override.until) {
      return Math.round((override.pct / 100) * this.zoneCapacity(zoneId));
    }
    const zone = DEMO_VENUE.zones.find((z) => z.id === zoneId);
    if (!zone) return 0;
    if (zone.kind === "gate") {
      const queued = zone.gateIds.reduce((sum, id) => sum + (this.gates.get(id)?.queueLength ?? 0), 0);
      return queued + Math.round(this.rng() * 200);
    }
    const concourseShare = this.phase === "halftime" ? 0.42 : this.phase === "gates-open" ? 0.3 : 0.1;
    const jitter = 0.92 + this.rng() * 0.16;
    if (zone.kind === "concourse") {
      return Math.round(((this.inside * concourseShare) / 2) * jitter);
    }
    if (zone.kind === "seating") {
      return Math.round(this.inside * (1 - concourseShare) * jitter);
    }
    return Math.round(this.rng() * zone.capacity * 0.3);
  }
}
