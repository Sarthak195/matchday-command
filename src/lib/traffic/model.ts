import { VENUE_LOCATION } from "@/shared/constants";
import type {
  CongestionLevel,
  Corridor,
  MatchPhase,
  ParkingLot,
  TrafficAdvisory,
  TrafficState,
} from "@/shared/models";

/**
 * Deterministic approach-traffic model. Congestion rises as fans arrive (peaks
 * ~15 min before kickoff) and again at egress after full time. Runs client-side
 * from the sim clock — no external calls. When the Google Maps key is present the
 * map also shows Google's live TrafficLayer on top of these overlays.
 */

const { lat, lng } = VENUE_LOCATION;

/** Geo fixtures around the venue (offsets in degrees ≈ 1–3 km). */
const CORRIDORS: Omit<Corridor, "congestion" | "etaMin">[] = [
  {
    id: "ab-road-north",
    name: "AB Road approach (north)",
    path: [
      { lat: lat + 0.03, lng: lng + 0.004 },
      { lat: lat + 0.012, lng: lng + 0.001 },
      { lat, lng },
    ],
  },
  {
    id: "ring-road-east",
    name: "Ring Road (east)",
    path: [
      { lat: lat + 0.006, lng: lng + 0.03 },
      { lat: lat + 0.002, lng: lng + 0.012 },
      { lat, lng },
    ],
  },
  {
    id: "bypass-south",
    name: "Bypass (south)",
    path: [
      { lat: lat - 0.028, lng: lng - 0.006 },
      { lat: lat - 0.01, lng: lng - 0.002 },
      { lat, lng },
    ],
  },
];

const LOTS: Omit<ParkingLot, "occupancy">[] = [
  {
    id: "lot-a",
    name: "Lot A (north)",
    capacity: 3200,
    location: { lat: lat + 0.006, lng: lng + 0.002 },
  },
  {
    id: "lot-b",
    name: "Lot B (east)",
    capacity: 2600,
    location: { lat: lat + 0.001, lng: lng + 0.007 },
  },
  {
    id: "lot-c",
    name: "Lot C (south)",
    capacity: 2400,
    location: { lat: lat - 0.006, lng: lng - 0.003 },
  },
];

function levelFromLoad(load: number): CongestionLevel {
  if (load >= 0.85) return "severe";
  if (load >= 0.6) return "heavy";
  if (load >= 0.35) return "moderate";
  return "clear";
}

const ETA_BASE: Record<CongestionLevel, number> = { clear: 6, moderate: 11, heavy: 19, severe: 28 };

/** 0..1 pressure on the road network at a given match minute. */
function loadCurve(minute: number, phase: MatchPhase): number {
  if (phase === "fulltime") {
    // Egress surge: heavy right after full time, easing over ~30 min.
    return Math.max(0, 0.95 - (minute - 165) * 0.03);
  }
  const kickoff = 60;
  if (minute >= kickoff) return 0.15; // inside the match, roads are quiet
  // Arrival ramp peaking ~15 min before kickoff.
  const peak = kickoff - 15;
  const x = (minute - peak) / 22;
  return Math.min(0.95, 0.9 * Math.exp(-x * x) + 0.1);
}

export function trafficAt(minute: number, phase: MatchPhase, seed = 1): TrafficState {
  const load = loadCurve(minute, phase);
  // Corridors carry slightly different shares so they don't move in lockstep.
  const shares = [1.05, 0.9, 0.8];
  const corridors: Corridor[] = CORRIDORS.map((c, i) => {
    const level = levelFromLoad(Math.min(0.98, load * shares[i]));
    return {
      ...c,
      congestion: level,
      etaMin: Math.round(ETA_BASE[level] * (0.9 + ((seed * (i + 2)) % 5) / 20)),
    };
  });

  const lots: ParkingLot[] = LOTS.map((l, i) => ({
    ...l,
    occupancy: Math.min(l.capacity, Math.round(l.capacity * Math.min(1, load * (0.8 + i * 0.12)))),
  }));

  const advisories: TrafficAdvisory[] = [];
  const worst = corridors.reduce((a, b) => (a.etaMin >= b.etaMin ? a : b));
  if (worst.congestion === "severe" || worst.congestion === "heavy") {
    const clearest = corridors.reduce((a, b) => (a.etaMin <= b.etaMin ? a : b));
    advisories.push({
      id: `adv-route-${minute}`,
      message: `${worst.name} congested (${worst.etaMin} min) — steer arrivals to ${clearest.name} (${clearest.etaMin} min).`,
      severity: "warning",
    });
  }
  const fullLot = lots.find((l) => l.occupancy / l.capacity >= 0.9);
  const openLot = [...lots].sort((a, b) => a.occupancy / a.capacity - b.occupancy / b.capacity)[0];
  if (fullLot && openLot && fullLot.id !== openLot.id) {
    advisories.push({
      id: `adv-park-${minute}`,
      message: `${fullLot.name} near full — direct parking to ${openLot.name}.`,
      severity: "warning",
    });
  }
  if (phase === "fulltime") {
    advisories.push({
      id: `adv-egress-${minute}`,
      message:
        "Egress underway — hold pedestrian crossing priority on Ring Road, stage taxis at Lot B.",
      severity: "info",
    });
  }

  return { atMinute: minute, corridors, lots, advisories };
}
