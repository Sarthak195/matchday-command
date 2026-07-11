import type { RadioChannel } from "./events";

/**
 * An Incident is a cluster of related events that needs an operator decision.
 * Incidents are opened by detection rules (or manually); Gemini fills in `triage`.
 */

export type IncidentSeverity = "info" | "low" | "medium" | "high" | "critical";

export type IncidentStatus = "open" | "acknowledged" | "resolving" | "resolved";

export type IncidentCategory =
  | "crowd"
  | "medical"
  | "security"
  | "weather"
  | "facilities"
  | "other";

export interface RecommendedAction {
  action: string; // e.g. "Open Gate D for overflow entry"
  assignTo: RadioChannel;
  /** 1 = do now, 2 = next 10 minutes, 3 = monitor */
  priority: 1 | 2 | 3;
}

export interface TriageResult {
  summary: string;
  severity: IncidentSeverity;
  rationale: string;
  recommendedActions: RecommendedAction[];
  /** True when the venue director must be paged. */
  escalate: boolean;
}

export interface Incident {
  id: string;
  createdAtMinute: number;
  title: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  zoneId?: string;
  /** Events that led to this incident being opened. */
  sourceEventIds: string[];
  /** Populated asynchronously by the Gemini triage endpoint. */
  triage?: TriageResult;
}
