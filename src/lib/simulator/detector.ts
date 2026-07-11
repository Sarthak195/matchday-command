import {
  DENSITY_ALERT_PCT,
  DENSITY_CRITICAL_PCT,
  DEMO_VENUE,
  QUEUE_ALERT_LENGTH,
} from "@/shared/constants";
import type { Incident, IncidentSeverity, StadiumEvent } from "@/shared/models";

function zoneName(zoneId: string): string {
  return DEMO_VENUE.zones.find((z) => z.id === zoneId)?.name ?? zoneId;
}

function gateName(gateId: string): string {
  return DEMO_VENUE.gates.find((g) => g.id === gateId)?.name ?? gateId;
}

/**
 * Rule-based incident detection over the event stream. Rules open incidents;
 * Gemini only ever fills in the triage. Each rule dedupes on a key so one
 * ongoing situation doesn't open a new incident every telemetry cycle.
 */
export class IncidentDetector {
  private seq = 0;
  private openKeys = new Set<string>();

  process(events: StadiumEvent[], minute: number): Incident[] {
    const found: Incident[] = [];
    for (const event of events) {
      switch (event.type) {
        case "crowd-density": {
          if (event.densityPct >= DENSITY_ALERT_PCT) {
            const severity: IncidentSeverity =
              event.densityPct >= DENSITY_CRITICAL_PCT ? "high" : "medium";
            this.openOnce(found, `crowd:${event.zoneId}`, {
              title: `Crowd density ${event.densityPct}% in ${zoneName(event.zoneId)}`,
              category: "crowd",
              severity,
              zoneId: event.zoneId,
              sourceEventIds: [event.id],
              minute,
            });
          }
          break;
        }
        case "gate-flow": {
          if (event.queueLength >= QUEUE_ALERT_LENGTH) {
            this.openOnce(found, `gate:${event.gateId}`, {
              title: `${gateName(event.gateId)} queue at ${event.queueLength}`,
              category: "crowd",
              severity: "medium",
              zoneId: DEMO_VENUE.gates.find((g) => g.id === event.gateId)?.zoneId,
              sourceEventIds: [event.id],
              minute,
            });
          }
          break;
        }
        case "medical": {
          const severity: IncidentSeverity =
            event.severityHint === "life-threatening"
              ? "critical"
              : event.severityHint === "serious"
                ? "high"
                : "medium";
          found.push(
            this.open({
              title: `Medical: ${event.description}`,
              category: "medical",
              severity,
              zoneId: event.zoneId,
              sourceEventIds: [event.id],
              minute,
            }),
          );
          break;
        }
        case "weather": {
          if (event.condition === "storm") {
            this.openOnce(found, "weather:storm", {
              title: `Storm approaching — ${event.note ?? "conditions deteriorating"}`,
              category: "weather",
              severity: "medium",
              sourceEventIds: [event.id],
              minute,
            });
          }
          break;
        }
        default:
          break; // radio logs feed triage context, they don't auto-open incidents
      }
    }
    return found;
  }

  private openOnce(
    into: Incident[],
    key: string,
    draft: Parameters<IncidentDetector["open"]>[0],
  ): void {
    if (this.openKeys.has(key)) return;
    this.openKeys.add(key);
    into.push(this.open(draft));
  }

  private open(draft: {
    title: string;
    category: Incident["category"];
    severity: IncidentSeverity;
    zoneId?: string;
    sourceEventIds: string[];
    minute: number;
  }): Incident {
    return {
      id: `inc-${this.seq++}`,
      createdAtMinute: draft.minute,
      title: draft.title,
      category: draft.category,
      severity: draft.severity,
      status: "open",
      zoneId: draft.zoneId,
      sourceEventIds: draft.sourceEventIds,
    };
  }
}
