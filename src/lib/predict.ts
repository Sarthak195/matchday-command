import { DEMO_VENUE, DENSITY_ALERT_PCT, QUEUE_ALERT_LENGTH } from "@/shared/constants";
import type { StadiumEvent } from "@/shared/models";

/**
 * Trend projection over the live telemetry: if a zone's density or a gate's
 * queue is rising toward its alert threshold, warn *before* the incident rule
 * fires. Pure function of the event log — runs client-side every tick.
 */

export interface EarlyWarning {
  id: string;
  kind: "zone" | "gate";
  targetId: string;
  name: string;
  /** Current value: density % for zones, queue length for gates. */
  current: number;
  threshold: number;
  etaMin: number;
  ratePerMin: number;
  message: string;
}

interface Sample {
  atMinute: number;
  value: number;
}

/** Only project over recent history; older samples describe a different phase. */
const WINDOW_MIN = 25;
/** Don't warn about breaches further out than this — too speculative. */
const MAX_ETA_MIN = 20;
const MIN_ETA_MIN = 1;

function projectSeries(samples: Sample[], threshold: number, minRate: number, nowMinute: number) {
  const recent = samples.filter((s) => nowMinute - s.atMinute <= WINDOW_MIN);
  if (recent.length < 2) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (last.value >= threshold) return null; // already breached — that's an incident, not a forecast
  const dt = last.atMinute - first.atMinute;
  if (dt <= 0) return null;
  const rate = (last.value - first.value) / dt;
  if (rate < minRate) return null;
  const eta = (threshold - last.value) / rate;
  if (eta < MIN_ETA_MIN || eta > MAX_ETA_MIN) return null;
  return { current: last.value, ratePerMin: rate, etaMin: Math.round(eta) };
}

export function computeWarnings(events: StadiumEvent[], nowMinute: number): EarlyWarning[] {
  // Rebuild per-target time series (events arrive newest-first in client state).
  const zoneSeries = new Map<string, Sample[]>();
  const gateSeries = new Map<string, Sample[]>();
  for (const e of [...events].reverse()) {
    if (e.type === "crowd-density") {
      const arr = zoneSeries.get(e.zoneId) ?? [];
      arr.push({ atMinute: e.atMinute, value: e.densityPct });
      zoneSeries.set(e.zoneId, arr);
    } else if (e.type === "gate-flow") {
      const arr = gateSeries.get(e.gateId) ?? [];
      arr.push({ atMinute: e.atMinute, value: e.queueLength });
      gateSeries.set(e.gateId, arr);
    }
  }

  const warnings: EarlyWarning[] = [];

  for (const [zoneId, samples] of zoneSeries) {
    const zone = DEMO_VENUE.zones.find((z) => z.id === zoneId);
    if (!zone || zone.kind === "gate") continue; // gate plazas tracked via queues
    const p = projectSeries(samples, DENSITY_ALERT_PCT, 0.3, nowMinute);
    if (!p) continue;
    warnings.push({
      id: `warn-zone-${zoneId}`,
      kind: "zone",
      targetId: zoneId,
      name: zone.name,
      current: p.current,
      threshold: DENSITY_ALERT_PCT,
      etaMin: p.etaMin,
      ratePerMin: p.ratePerMin,
      message: `${zone.name} on track to hit ${DENSITY_ALERT_PCT}% in ~${p.etaMin}′ (${Math.round(p.current)}% now, +${p.ratePerMin.toFixed(1)}%/min)`,
    });
  }

  for (const [gateId, samples] of gateSeries) {
    const gate = DEMO_VENUE.gates.find((g) => g.id === gateId);
    if (!gate) continue;
    const p = projectSeries(samples, QUEUE_ALERT_LENGTH, 8, nowMinute);
    if (!p) continue;
    warnings.push({
      id: `warn-gate-${gateId}`,
      kind: "gate",
      targetId: gateId,
      name: gate.name,
      current: p.current,
      threshold: QUEUE_ALERT_LENGTH,
      etaMin: p.etaMin,
      ratePerMin: p.ratePerMin,
      message: `${gate.name} queue on track to hit ${QUEUE_ALERT_LENGTH} in ~${p.etaMin}′ (${Math.round(p.current)} now, +${Math.round(p.ratePerMin)}/min)`,
    });
  }

  return warnings.sort((a, b) => a.etaMin - b.etaMin);
}
