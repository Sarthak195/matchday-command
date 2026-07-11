import { DEMO_VENUE } from "@/shared/constants";
import type { StadiumEvent } from "@/shared/models";
import { SCENARIO } from "./scenario";

/**
 * Tick-based match-day simulator. Each tick advances the clock one simulated
 * minute and returns the events for that minute: scripted scenario beats plus
 * (TODO) baseline gate-flow and crowd-density noise so the dashboard always
 * has a pulse.
 */
export class SimulationEngine {
  private minute = 0;
  private seq = 0;

  tick(): StadiumEvent[] {
    const drafts = SCENARIO.filter((b) => b.atMinute === this.minute).flatMap((b) => b.events);
    const events = drafts.map(
      (draft) =>
        ({
          ...draft,
          id: `evt-${this.seq++}`,
          venueId: DEMO_VENUE.id,
        }) as StadiumEvent,
    );
    // TODO(sim): emit baseline gate-flow per gate (arrival curve peaking before
    // kickoff) and crowd-density per zone, so anomalies stand out against noise.
    this.minute += 1;
    return events;
  }

  get clockMinute(): number {
    return this.minute;
  }
}
