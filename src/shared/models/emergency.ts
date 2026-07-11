/** Major-incident posture: an AI-generated evacuation plan for the venue. */

export interface EvacZoneOrder {
  zoneId: string;
  zoneName: string;
  /** What happens in this zone, e.g. "Hold in place" / "Evacuate via Gate A". */
  instruction: string;
  exitVia: string;
  /** 1 = move first, 2 = second wave, 3 = hold/last. */
  priority: 1 | 2 | 3;
}

export interface EvacuationPlan {
  id: string;
  generatedAtMinute: number;
  /** Calm, clear PA announcement text, ready to read out. */
  paAnnouncement: string;
  /** Ops-facing situation order: what, why, sequence. */
  commandSummary: string;
  zoneOrders: EvacZoneOrder[];
}
