/** AI-generated documents for the ops room: periodic briefings and shift handovers. */

export interface OpsBriefing {
  id: string;
  generatedAtMinute: number;
  headline: string;
  /** Markdown situation summary written for the ops room, not for fans. */
  situation: string;
  openIncidentIds: string[];
  watchItems: string[];
  crowdOutlook: string;
}

export interface HandoverReport {
  id: string;
  /** Human label for the shift window, e.g. "Gates open → halftime". */
  shift: string;
  generatedAtMinute: number;
  /** Markdown narrative of what happened, decisions taken, and why. */
  narrative: string;
  resolvedIncidentIds: string[];
  openIncidentIds: string[];
  actionsForNextShift: string[];
}
