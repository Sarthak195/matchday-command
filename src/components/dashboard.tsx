"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEMO_VENUE, QUEUE_ALERT_LENGTH, SIM_TICK_FAST_MS, SIM_TICK_MS } from "@/shared/constants";
import type {
  EvacuationPlan,
  HandoverReport,
  Incident,
  OpsBriefing,
  StadiumEvent,
  TriageResult,
  WeatherForecast,
} from "@/shared/models";
import {
  ACCENT,
  CRITICAL_TEXT,
  PHASE_LABEL,
  SEVERITY_META,
  STATUS,
  densityState,
} from "@/lib/theme";
import { trafficAt } from "@/lib/traffic/model";
import { insideEstimate, useMatchStream, worstDensityPct } from "@/lib/useMatchStream";
import { SCENARIO } from "@/lib/simulator/scenario";
import { computeWarnings, type EarlyWarning } from "@/lib/predict";
import { Panel, StatRow } from "@/components/primitives";
import { Modal } from "@/components/modal";
import { DocOverlay, EventLine, IncidentCard } from "@/components/dashboard-parts";
import { VenueMap } from "@/components/venue-map";
import { Copilot, type ToolCall } from "@/components/copilot";
import { VoiceRadio } from "@/components/voice-radio";

/** Scripted story beats, for the "next beat" jump control. */
const BEAT_MINUTES = SCENARIO.map((b) => b.atMinute);

/** Events worth sending to Gemini as context for one incident. */
function triageContext(incident: Incident, events: StadiumEvent[]): StadiumEvent[] {
  const related = events.filter((e) => {
    if ("zoneId" in e && e.zoneId === incident.zoneId) return true;
    if (e.type === "gate-flow") {
      const gate = DEMO_VENUE.gates.find((g) => g.id === e.gateId);
      if (gate?.zoneId === incident.zoneId) return true;
    }
    if (e.type === "radio-log" && Math.abs(e.atMinute - incident.createdAtMinute) <= 10)
      return true;
    return incident.sourceEventIds.includes(e.id);
  });
  const picked = (related.length > 0 ? related : events).slice(0, 15);
  return [...picked].reverse(); // chronological, most recent last
}

/** Compact one-line rendering of an event for the copilot's context window. */
function eventToText(e: StadiumEvent): string {
  const zone = (id: string) => DEMO_VENUE.zones.find((z) => z.id === id)?.name ?? id;
  const gate = (id: string) => DEMO_VENUE.gates.find((g) => g.id === id)?.name ?? id;
  switch (e.type) {
    case "match":
      return `${e.atMinute}′ match: ${e.phase}${e.note ? ` — ${e.note}` : ""}`;
    case "radio-log":
      return `${e.atMinute}′ radio (${e.channel}) ${e.from}: ${e.message}`;
    case "gate-flow":
      return `${e.atMinute}′ ${gate(e.gateId)}: ${e.entriesPerMinute}/min, queue ${e.queueLength}`;
    case "crowd-density":
      return `${e.atMinute}′ ${zone(e.zoneId)} density ${e.densityPct}%`;
    case "medical":
      return `${e.atMinute}′ medical in ${zone(e.zoneId)}: ${e.description}`;
    case "weather":
      return `${e.atMinute}′ weather: ${e.condition}, ${e.tempC}°C${e.note ? ` — ${e.note}` : ""}`;
  }
}

export default function Dashboard() {
  const { state, dispatch, connected } = useMatchStream();
  const [speed, setSpeed] = useState(SIM_TICK_MS);

  /** Sim controls are GLOBAL — every connected view follows the shared match. */
  async function simControl(
    body:
      { type: "speed"; tickMs: number } | { type: "jump"; toMinute: number } | { type: "restart" },
  ) {
    try {
      await fetch("/api/sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // transient — the stream keeps flowing either way
    }
  }

  const [triaging, setTriaging] = useState<Set<string>>(new Set());
  const [briefing, setBriefing] = useState<OpsBriefing | null>(null);
  const [handover, setHandover] = useState<HandoverReport | null>(null);
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [emergency, setEmergency] = useState<{
    phase: "off" | "confirm" | "activating" | "active";
    plan?: EvacuationPlan;
    showPlan?: boolean;
  }>({ phase: "off" });
  const [doc, setDoc] = useState<
    | { kind: "briefing"; data: OpsBriefing }
    | { kind: "handover"; data: HandoverReport }
    | { kind: "loading"; label: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/weather")
      .then((r) => r.json())
      .then((f: WeatherForecast) => {
        if (!cancelled) setForecast(f);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const nextBeat = BEAT_MINUTES.find((m) => m > state.minute);
  const traffic = useMemo(() => trafficAt(state.minute, state.phase), [state.minute, state.phase]);
  const warnings = useMemo(
    () => computeWarnings(state.events, state.minute),
    [state.events, state.minute],
  );
  const openIncidents = state.incidents.filter((i) => i.status !== "resolved");
  const worstDensity = useMemo(() => worstDensityPct(state.zones), [state.zones]);
  const inside = useMemo(() => insideEstimate(state.zones), [state.zones]);

  async function runTriage(incident: Incident) {
    setTriaging((prev) => new Set(prev).add(incident.id));
    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: incident.title,
          category: incident.category,
          zoneId: incident.zoneId,
          contextEvents: triageContext(incident, state.events),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Triage failed");
      dispatch({ type: "triage", incidentId: incident.id, triage: data as TriageResult });
    } catch (err) {
      setDoc({ kind: "error", message: err instanceof Error ? err.message : "Triage failed" });
    } finally {
      setTriaging((prev) => {
        const next = new Set(prev);
        next.delete(incident.id);
        return next;
      });
    }
  }

  async function generateDoc(type: "briefing" | "handover") {
    setDoc({
      kind: "loading",
      label: type === "briefing" ? "Writing ops briefing…" : "Writing handover…",
    });
    try {
      const res = await fetch(`/api/briefing${type === "handover" ? "?type=handover" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minute: state.minute,
          incidents: state.incidents,
          recentEvents: [...state.events.slice(0, 40)].reverse(),
          shiftLabel: type === "handover" ? `Gates open → minute ${state.minute}` : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      // Only surface the result if the operator hasn't closed the overlay (or
      // opened something else) while the doc was being written.
      if (type === "briefing") {
        setBriefing(data as OpsBriefing);
        setDoc((prev) => (prev?.kind === "loading" ? { kind: "briefing", data } : prev));
      } else {
        setHandover(data as HandoverReport);
        setDoc((prev) => (prev?.kind === "loading" ? { kind: "handover", data } : prev));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setDoc((prev) => (prev?.kind === "loading" ? { kind: "error", message } : prev));
    }
  }

  /** Download everything the ops room produced as a markdown match-day report. */
  function exportReport() {
    const lines: string[] = [
      `# Match-day ops report — ${DEMO_VENUE.name}, ${DEMO_VENUE.city}`,
      "",
      `Simulated clock ${state.minute}′ · ${PHASE_LABEL[state.phase]} · generated by MatchDay Command`,
      "",
      `## Incidents (${state.incidents.length})`,
      "",
    ];
    if (state.incidents.length === 0) lines.push("_No incidents recorded._");
    for (const i of [...state.incidents].reverse()) {
      lines.push(
        `- **${SEVERITY_META[i.severity].label}** · ${i.title} — opened ${i.createdAtMinute}′, ${i.status}`,
      );
      if (i.triage) {
        lines.push(`  - AI triage: ${i.triage.summary}`);
        for (const a of i.triage.recommendedActions) {
          lines.push(`  - P${a.priority}: ${a.action} (${a.assignTo})`);
        }
        if (i.triage.escalate) lines.push("  - **Escalated to venue director**");
      }
    }
    if (briefing) {
      lines.push(
        "",
        `## Ops briefing (minute ${briefing.generatedAtMinute})`,
        "",
        `**${briefing.headline}**`,
        "",
        briefing.situation,
        "",
        "Watch items:",
        ...briefing.watchItems.map((w) => `- ${w}`),
        "",
        `Crowd outlook: ${briefing.crowdOutlook}`,
      );
    }
    if (handover) {
      lines.push(
        "",
        `## Shift handover — ${handover.shift}`,
        "",
        handover.narrative,
        "",
        "For the next shift:",
        ...handover.actionsForNextShift.map((a) => `- ${a}`),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matchday-report-${state.minute}min.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Add an incident to the queue locally (predictive warnings, copilot). */
  const localSeq = useRef(0);
  function openLocalIncident(input: {
    title: string;
    category: Incident["category"];
    severity: Incident["severity"];
    zoneId?: string;
  }): Incident {
    const incident: Incident = {
      id: `inc-local-${localSeq.current++}`,
      createdAtMinute: state.minute,
      title: input.title,
      category: input.category,
      severity: input.severity,
      status: "open",
      zoneId: input.zoneId,
      sourceEventIds: [],
    };
    dispatch({ type: "message", msg: { kind: "incident", incident } });
    return incident;
  }

  function incidentFromWarning(w: EarlyWarning) {
    const zoneId =
      w.kind === "zone" ? w.targetId : DEMO_VENUE.gates.find((g) => g.id === w.targetId)?.zoneId;
    openLocalIncident({
      title: `Projected: ${w.message.split(" (")[0]}`,
      category: "crowd",
      severity: "medium",
      zoneId,
    });
  }

  /** Voice radio reports enter the feed as radio-log events. */
  const voiceSeq = useRef(0);
  function handleVoice(text: string) {
    const event: StadiumEvent = {
      type: "radio-log",
      id: `evt-voice-${voiceSeq.current++}`,
      venueId: DEMO_VENUE.id,
      atMinute: state.minute,
      channel: "stewarding",
      from: "Voice report",
      message: text,
    };
    dispatch({ type: "message", msg: { kind: "event", event } });
  }

  /** Live state snapshot for the copilot — built at send time. */
  function copilotSnapshot() {
    return {
      minute: state.minute,
      phase: state.phase,
      weather: forecast?.summary ?? "unknown",
      zones: DEMO_VENUE.zones
        .filter((z) => z.kind !== "medical")
        .map((z) => ({ id: z.id, name: z.name, densityPct: state.zones[z.id]?.densityPct ?? 0 })),
      gates: DEMO_VENUE.gates.map((g) => ({
        id: g.id,
        name: g.name,
        entriesPerMinute: state.gates[g.id]?.entriesPerMinute ?? 0,
        queueLength: state.gates[g.id]?.queueLength ?? 0,
      })),
      incidents: state.incidents.slice(0, 12).map((i) => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        status: i.status,
        zoneId: i.zoneId,
        aiTriageSummary: i.triage?.summary,
      })),
      earlyWarnings: warnings.map((w) => w.message),
      trafficAdvisories: traffic.advisories.map((a) => a.message),
      recentEvents: [...state.events.slice(0, 20)].reverse().map(eventToText),
    };
  }

  /** Declare a major incident: Gemini writes the evacuation plan and the staff
   *  work orders (dispatched server-side into the shared task queue). */
  async function activateEmergency() {
    setEmergency({ phase: "activating" });
    const declared: StadiumEvent = {
      type: "radio-log",
      id: `evt-emergency-${state.minute}`,
      venueId: DEMO_VENUE.id,
      atMinute: state.minute,
      channel: "security",
      from: "Duty Manager",
      message: "EMERGENCY DECLARED — controlled evacuation ordered, all gates to egress",
    };
    dispatch({ type: "message", msg: { kind: "event", event: declared } });
    try {
      const res = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minute: state.minute,
          reason: "Controlled evacuation ordered by the duty manager (drill)",
          zones: DEMO_VENUE.zones.map((z) => ({
            id: z.id,
            name: z.name,
            densityPct: state.zones[z.id]?.densityPct ?? 0,
            occupancy: state.zones[z.id]?.occupancy ?? 0,
          })),
          incidents: state.incidents.filter((i) => i.status !== "resolved"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Evacuation planning failed");
      setEmergency({ phase: "active", plan: data.plan as EvacuationPlan, showPlan: true });
    } catch (err) {
      setEmergency({ phase: "off" });
      setDoc({
        kind: "error",
        message: err instanceof Error ? err.message : "Evacuation planning failed",
      });
    }
  }

  /** Execute a copilot tool call; the returned line is echoed into the chat. */
  async function runToolCall(call: ToolCall): Promise<string> {
    switch (call.name) {
      case "open_incident": {
        const a = call.args as {
          title: string;
          category?: Incident["category"];
          severity?: Incident["severity"];
          zoneId?: string;
        };
        const incident = openLocalIncident({
          title: a.title,
          category: a.category ?? "other",
          severity: a.severity ?? "medium",
          zoneId: a.zoneId,
        });
        return `✓ Opened ${incident.severity} incident: ${incident.title}`;
      }
      case "dispatch_task": {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...call.args, origin: "copilot", createdAtMinute: state.minute }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "dispatch failed");
        return `✓ Dispatched to ${data.task.role}: ${data.task.title} (P${data.task.priority}) — visible on the staff console`;
      }
      case "generate_briefing":
        void generateDoc("briefing");
        return "✓ Generating the ops briefing — opening it now";
      default:
        throw new Error(`Unknown tool: ${call.name}`);
    }
  }

  const emergencyActive = emergency.phase === "active";

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#c3c2b7]">
      {emergencyActive && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: STATUS.critical }}
        >
          <span>⚠ EMERGENCY MODE — controlled evacuation in progress · all gates to egress</span>
          <span className="flex gap-2">
            <button
              onClick={() => setEmergency((e) => ({ ...e, showPlan: true }))}
              className="rounded border border-white/40 px-2.5 py-0.5 text-xs hover:bg-white/10"
            >
              View plan
            </button>
            <button
              onClick={() => setEmergency({ phase: "off" })}
              className="rounded border border-white/40 px-2.5 py-0.5 text-xs hover:bg-white/10"
            >
              Stand down
            </button>
          </span>
        </div>
      )}
      <header className="border-b border-white/10 bg-[#1a1a19]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <div>
            <h1
              className="text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: ACCENT }}
            >
              MatchDay Command
            </h1>
            <p className="text-xs text-[#898781]">
              {DEMO_VENUE.name}, {DEMO_VENUE.city} · ops control room
            </p>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold text-white">{state.minute}&prime;</span>
            <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-[#c3c2b7]">
              {PHASE_LABEL[state.phase]}
            </span>
            <span
              role="status"
              aria-live="polite"
              className="text-xs"
              style={{ color: connected ? STATUS.good : STATUS.serious }}
            >
              {connected ? "● Live" : "○ Reconnecting"}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-[#898781]">
              Sim speed
              <select
                value={speed}
                onChange={(e) => {
                  const tickMs = Number(e.target.value);
                  setSpeed(tickMs);
                  void simControl({ type: "speed", tickMs });
                }}
                className="rounded border border-white/10 bg-[#0d0d0d] px-2 py-1 text-xs text-white"
              >
                <option value={SIM_TICK_MS}>1×</option>
                <option value={SIM_TICK_FAST_MS}>4×</option>
              </select>
            </label>
            <button
              onClick={() =>
                nextBeat !== undefined && void simControl({ type: "jump", toMinute: nextBeat })
              }
              disabled={nextBeat === undefined}
              title="Fast-forward the shared match to the next scripted story beat (all views follow)"
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/5 disabled:opacity-40"
            >
              ⏭ Next beat{nextBeat !== undefined ? ` (${nextBeat}′)` : ""}
            </button>
            <button
              onClick={() => void simControl({ type: "restart" })}
              title="Restart the shared match from gates-open (all views follow)"
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/5"
            >
              ↺ Restart
            </button>
            <button
              onClick={() => generateDoc("briefing")}
              className="rounded bg-[#1c5cab] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#256abf]"
            >
              Ops briefing
            </button>
            <button
              onClick={() => generateDoc("handover")}
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/5"
            >
              Shift handover
            </button>
            <button
              onClick={exportReport}
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/5"
            >
              ↓ Export report
            </button>
            <Link
              href="/staff"
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/5"
            >
              Staff view →
            </Link>
            <Link
              href="/tournament"
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/5"
            >
              Tournament →
            </Link>
            {!emergencyActive && (
              <button
                onClick={() => setEmergency({ phase: "confirm" })}
                disabled={emergency.phase === "activating"}
                className="rounded px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: STATUS.critical }}
              >
                {emergency.phase === "activating" ? "Planning…" : "⚠ Emergency"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[300px_minmax(0,1fr)_380px]">
        {/* Zones, gates, weather */}
        <section className="order-1 space-y-4 lg:order-none">
          <Panel title="Zone density">
            <ul className="space-y-3">
              {DEMO_VENUE.zones
                .filter((z) => z.kind !== "medical")
                .map((zone) => {
                  const pct = state.zones[zone.id]?.densityPct ?? 0;
                  const s = densityState(pct);
                  return (
                    <li key={zone.id}>
                      <div className="mb-1 flex items-baseline justify-between text-xs">
                        <span className="text-[#c3c2b7]">{zone.name}</span>
                        <span>
                          <span className="font-semibold text-white">{pct}%</span>{" "}
                          <span style={{ color: s.color }}>{s.label}</span>
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full"
                        style={{ backgroundColor: `${s.color}33` }}
                      >
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: s.color }}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          </Panel>

          <Panel title="Early warnings">
            {warnings.length === 0 ? (
              <p className="text-xs text-[#898781]">Trends nominal — no projected breaches.</p>
            ) : (
              <ul className="space-y-2.5" aria-live="polite" aria-label="Projected breach warnings">
                {warnings.map((w) => (
                  <li key={w.id} className="text-xs">
                    <p>
                      <span style={{ color: STATUS.warning }}>▲ Projected</span>{" "}
                      <span className="text-[#c3c2b7]">{w.message}</span>
                    </p>
                    <button
                      onClick={() => incidentFromWarning(w)}
                      className="mt-1 rounded border border-white/10 px-2 py-0.5 text-[11px] text-white hover:bg-white/5"
                    >
                      Open incident pre-emptively
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Gates">
            <div className="grid grid-cols-2 gap-2">
              {DEMO_VENUE.gates.map((gate) => {
                const g = state.gates[gate.id];
                const queue = g?.queueLength ?? 0;
                const qs =
                  queue >= QUEUE_ALERT_LENGTH
                    ? { label: "Alert", color: STATUS.serious }
                    : queue >= QUEUE_ALERT_LENGTH / 2
                      ? { label: "Watch", color: STATUS.warning }
                      : { label: "OK", color: STATUS.good };
                return (
                  <div
                    key={gate.id}
                    className="rounded border border-white/10 bg-[#0d0d0d] p-2.5"
                    style={{
                      borderLeft: `2px solid ${emergencyActive ? STATUS.critical : qs.color}`,
                    }}
                  >
                    <p className="text-xs text-[#898781]">{gate.name}</p>
                    {emergencyActive ? (
                      <p className="text-lg font-semibold" style={{ color: CRITICAL_TEXT }}>
                        EGRESS
                      </p>
                    ) : (
                      <p className="text-lg font-semibold text-white">{g?.entriesPerMinute ?? 0}</p>
                    )}
                    <p className="text-[11px] text-[#898781]">
                      {emergencyActive ? (
                        "exit-only mode"
                      ) : (
                        <>
                          entries/min · queue {queue} ·{" "}
                          <span style={{ color: qs.color }}>{qs.label}</span>
                        </>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Weather">
            {forecast ? (
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-semibold text-white">
                    {Math.round(forecast.tempC)}°C
                  </span>
                  <span className="text-sm capitalize text-[#c3c2b7]">{forecast.condition}</span>
                </div>
                <p className="mt-1 text-xs text-[#898781]">{forecast.summary}</p>
                <p className="mt-1 text-[11px] text-[#898781]">
                  {forecast.source === "live" ? "● Live (Open-Meteo)" : "● Simulated fallback"}
                </p>
              </div>
            ) : (
              <p className="py-3 text-center text-xs text-[#898781]">Loading forecast…</p>
            )}
          </Panel>

          <Panel title="Occupancy">
            <StatRow label="Inside (est.)" value={inside.toLocaleString()} />
            <StatRow label="Worst zone density" value={`${worstDensity}%`} />
            <StatRow label="Open incidents" value={String(openIncidents.length)} />
          </Panel>
        </section>

        {/* Map + live feed */}
        <div className="order-3 space-y-4 lg:order-none">
          <Panel title="Approach & traffic">
            <VenueMap traffic={traffic} />
            {traffic.advisories.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {traffic.advisories.map((a) => (
                  <li key={a.id} className="flex gap-2 text-xs">
                    <span
                      aria-hidden="true"
                      style={{ color: a.severity === "warning" ? STATUS.warning : STATUS.good }}
                    >
                      {a.severity === "warning" ? "▲" : "●"}
                    </span>
                    <span className="text-[#c3c2b7]">
                      <span className="sr-only">
                        {a.severity === "warning" ? "Warning: " : "Advisory: "}
                      </span>
                      {a.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Live feed"
            action={<VoiceRadio onTranscript={handleVoice} />}
            bodyClassName="max-h-[46vh] overflow-y-auto"
            bodyProps={{
              tabIndex: 0,
              role: "region",
              "aria-label": "Live event feed (scrollable)",
            }}
          >
            {state.events.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#898781]">Waiting for gate telemetry…</p>
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {state.events.slice(0, 60).map((e) => (
                  <li key={e.id} className="flex gap-3 py-1.5">
                    <span className="w-8 shrink-0 text-right text-xs tabular-nums text-[#898781]">
                      {e.atMinute}&prime;
                    </span>
                    <EventLine event={e} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Incident queue */}
        <Panel
          title={`Incidents (${openIncidents.length} open)`}
          className="order-2 lg:order-none"
          bodyClassName="max-h-[80vh] overflow-y-auto"
        >
          {state.incidents.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#898781]">
              No incidents — feed nominal. Rules open incidents automatically.
            </p>
          ) : (
            <ul
              className="space-y-3"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label="Incident queue"
            >
              {state.incidents.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  busy={triaging.has(incident.id)}
                  onTriage={() => runTriage(incident)}
                  onStatus={(status) =>
                    dispatch({ type: "status", incidentId: incident.id, status })
                  }
                />
              ))}
            </ul>
          )}
        </Panel>
      </main>

      {doc && <DocOverlay doc={doc} onClose={() => setDoc(null)} />}

      {emergency.phase === "confirm" && (
        <Modal
          onClose={() => setEmergency({ phase: "off" })}
          label="Declare a major incident"
          className="w-full max-w-md rounded-lg border border-white/10 bg-[#1a1a19] p-5"
        >
          <p className="text-sm font-semibold" style={{ color: CRITICAL_TEXT }}>
            ⚠ Declare a major incident?
          </p>
          <p className="mt-2 text-sm text-[#c3c2b7]">
            This flips the venue to evacuation posture: all gates go exit-only, Gemini writes the
            zone-by-zone evacuation plan, and work orders are dispatched to every staff role.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void activateEmergency()}
              className="rounded px-3 py-1.5 text-sm font-semibold text-white"
              style={{ backgroundColor: STATUS.critical }}
            >
              Activate emergency mode
            </button>
            <button
              onClick={() => setEmergency({ phase: "off" })}
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {emergencyActive && emergency.showPlan && emergency.plan && (
        <Modal
          onClose={() => setEmergency((e) => ({ ...e, showPlan: false }))}
          label="Evacuation plan"
          className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-[#1a1a19] p-5"
          style={{ borderColor: `${STATUS.critical}66` }}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: CRITICAL_TEXT }}
          >
            Evacuation plan · minute {emergency.plan.generatedAtMinute}
          </p>
          <div className="mt-3 rounded border border-white/10 bg-[#0d0d0d] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#898781]">
              PA announcement — read verbatim
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm italic text-white">
              “{emergency.plan.paAnnouncement}”
            </p>
          </div>
          <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#898781]">
            Command summary
          </h4>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[#c3c2b7]">
            {emergency.plan.commandSummary}
          </p>
          <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#898781]">
            Zone orders (in sequence)
          </h4>
          <ul className="mt-1 space-y-1.5">
            {[...emergency.plan.zoneOrders]
              .sort((a, b) => a.priority - b.priority)
              .map((o) => (
                <li key={o.zoneId} className="flex gap-2 text-sm">
                  <span className="mt-px h-4 w-4 shrink-0 rounded-full border border-white/20 text-center text-[10px] leading-4 text-white">
                    {o.priority}
                  </span>
                  <span>
                    <span className="font-medium text-white">{o.zoneName}:</span>{" "}
                    <span className="text-[#c3c2b7]">{o.instruction}</span>{" "}
                    <span className="text-[#898781]">→ {o.exitVia}</span>
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-3 text-xs text-[#898781]">
            Staff work orders were dispatched to the staff console automatically.
          </p>
          <button
            onClick={() => setEmergency((e) => ({ ...e, showPlan: false }))}
            className="mt-4 rounded border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/5"
          >
            Close
          </button>
        </Modal>
      )}

      <Copilot snapshot={copilotSnapshot} onToolCall={runToolCall} />

      <footer className="mx-auto max-w-[1400px] px-5 pb-4 text-[11px] text-[#898781]">
        Simulated telemetry · AI output is generated from on-screen events only · Google PromptWars
        2026
      </footer>
    </div>
  );
}
