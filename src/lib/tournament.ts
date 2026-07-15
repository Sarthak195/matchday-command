import { DEMO_VENUE } from "@/shared/constants";
import type { MatchPhase } from "@/shared/models";

/**
 * Tournament layer: sister venues playing the same match day with staggered
 * kickoffs. Meridian Arena is THE live simulation; the others are deterministic
 * summaries derived from the shared clock (clearly labeled as simulated) — the
 * point of the view is aggregate supervision, not four full sims.
 */

export interface TournamentVenue {
  id: string;
  name: string;
  city: string;
  capacity: number;
  /** This venue's local clock = shared minute + offset (staggered kickoffs). */
  clockOffsetMin: number;
  seed: number;
  live: boolean;
}

export const TOURNAMENT_VENUES: TournamentVenue[] = [
  {
    id: DEMO_VENUE.id,
    name: DEMO_VENUE.name,
    city: DEMO_VENUE.city,
    capacity: DEMO_VENUE.capacity,
    clockOffsetMin: 0,
    seed: 1,
    live: true,
  },
  {
    id: "lakeside",
    name: "Lakeside Stadium",
    city: "Bhopal",
    capacity: 38000,
    clockOffsetMin: 35,
    seed: 2,
    live: false,
  },
  {
    id: "garrison",
    name: "Garrison Park",
    city: "Jabalpur",
    capacity: 30000,
    clockOffsetMin: -20,
    seed: 3,
    live: false,
  },
  {
    id: "riverbend",
    name: "River Bend Arena",
    city: "Ujjain",
    capacity: 26000,
    clockOffsetMin: -50,
    seed: 4,
    live: false,
  },
];

export interface VenueSummary {
  venueId: string;
  localMinute: number;
  phase: MatchPhase;
  phaseLabel: string;
  worstDensityPct: number;
  openIncidents: number;
  insideEst: number;
  statusLine: string;
}

function phaseAt(minute: number): { phase: MatchPhase; label: string } {
  if (minute < 0) return { phase: "gates-open", label: "Pre-gates" };
  if (minute < 60) return { phase: "gates-open", label: "Gates open" };
  if (minute < 105) return { phase: "kickoff", label: "First half" };
  if (minute < 120) return { phase: "halftime", label: "Halftime" };
  if (minute < 165) return { phase: "second-half", label: "Second half" };
  return { phase: "fulltime", label: "Full time" };
}

/** Deterministic hash-noise in [0,1) — stable per (seed, bucket). */
function noise(seed: number, bucket: number): number {
  let x = (seed * 374761393 + bucket * 668265263) >>> 0;
  x = ((x ^ (x >>> 13)) * 1274126177) >>> 0;
  return (x >>> 8) / 16777216;
}

/** Simulated sister-venue summary at a shared-clock minute. */
export function venueSummary(venue: TournamentVenue, sharedMinute: number): VenueSummary {
  const m = sharedMinute + venue.clockOffsetMin;
  const { phase, label } = phaseAt(m);

  // Arrival S-curve into a density bump around kickoff and halftime.
  const fillFrac = m <= 0 ? 0 : Math.min(1, m / 75);
  const halftimeBump = phase === "halftime" ? 18 : 0;
  const base = phase === "fulltime" ? 35 : 25 + fillFrac * 45 + halftimeBump;
  const wobble = (noise(venue.seed, Math.floor(m / 5)) - 0.5) * 14;
  const worstDensityPct = Math.max(0, Math.min(97, Math.round(base + wobble)));

  // Incident count drifts up through the day, venue-flavored.
  const openIncidents =
    m <= 10
      ? 0
      : Math.max(
          0,
          Math.floor((m / 55) * (1.4 + noise(venue.seed, 7) * 2)) - (phase === "fulltime" ? 1 : 0),
        );

  const insideEst = Math.round(venue.capacity * 0.88 * fillFrac);

  const statusLine =
    worstDensityPct >= 85
      ? "Concourse pressure — stewards deployed"
      : openIncidents >= 3
        ? "Multiple incidents open — ops engaged"
        : phase === "halftime"
          ? "Halftime rush in progress"
          : phase === "fulltime"
            ? "Egress underway"
            : "Nominal";

  return {
    venueId: venue.id,
    localMinute: Math.max(0, m),
    phase,
    phaseLabel: label,
    worstDensityPct,
    openIncidents,
    insideEst,
    statusLine,
  };
}
