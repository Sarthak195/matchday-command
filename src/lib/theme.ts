import { DENSITY_ALERT_PCT, DENSITY_CRITICAL_PCT, DENSITY_WATCH_PCT } from "@/shared/constants";
import type { IncidentSeverity, MatchPhase } from "@/shared/models";

/* Dark-surface design tokens — validated for CVD separation + contrast.
   Status colors never carry meaning alone; always pair with a text label. */
export const INK = { primary: "#ffffff", secondary: "#c3c2b7", muted: "#898781" };
export const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" };
export const ACCENT = "#3987e5";

export const SEVERITY_META: Record<IncidentSeverity, { label: string; color: string }> = {
  info: { label: "Info", color: INK.muted },
  low: { label: "Low", color: STATUS.good },
  medium: { label: "Medium", color: STATUS.warning },
  high: { label: "High", color: STATUS.serious },
  critical: { label: "Critical", color: STATUS.critical },
};

export function densityState(pct: number): { label: string; color: string } {
  if (pct >= DENSITY_CRITICAL_PCT) return { label: "Critical", color: STATUS.critical };
  if (pct >= DENSITY_ALERT_PCT) return { label: "Alert", color: STATUS.serious };
  if (pct >= DENSITY_WATCH_PCT) return { label: "Watch", color: STATUS.warning };
  return { label: "OK", color: STATUS.good };
}

export const PHASE_LABEL: Record<MatchPhase, string> = {
  "gates-open": "Gates open",
  kickoff: "First half",
  goal: "First half",
  halftime: "Halftime",
  "second-half": "Second half",
  fulltime: "Full time",
};

export const CONGESTION_COLOR = {
  clear: STATUS.good,
  moderate: STATUS.warning,
  heavy: STATUS.serious,
  severe: STATUS.critical,
} as const;
