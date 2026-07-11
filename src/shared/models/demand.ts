/** Weather- and crowd-driven demand forecasting for stadium supplies. */

export type SupplyItem =
  | "umbrella"
  | "poncho"
  | "bottled-water"
  | "cold-drink"
  | "hot-beverage"
  | "hot-food"
  | "cold-food"
  | "handheld-fan"
  | "blanket"
  | "ice"
  | "energy-drink";

export type DemandUrgency = "now" | "before-kickoff" | "by-halftime" | "monitor";

export interface DemandLine {
  item: SupplyItem;
  /** Units the AI expects to move over the match window. */
  predictedUnits: number;
  currentStock: number;
  /** predictedUnits - currentStock; positive means shortfall to cover. */
  gap: number;
  /** Why this demand is predicted (weather / attendance / phase). */
  driver: string;
  urgency: DemandUrgency;
}

export interface DemandPlan {
  id: string;
  generatedAtMinute: number;
  /** The weather reasoning the plan is built on. */
  weatherBasis: string;
  summary: string;
  lines: DemandLine[];
}
