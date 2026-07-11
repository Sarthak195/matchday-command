"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import {
  DEMO_VENUE,
  DENSITY_ALERT_PCT,
  DENSITY_CRITICAL_PCT,
  DENSITY_WATCH_PCT,
  QUEUE_ALERT_LENGTH,
  SIM_TICK_MS,
} from "@/shared/constants";
import type {
  HandoverReport,
  Incident,
  IncidentSeverity,
  MatchPhase,
  OpsBriefing,
  StadiumEvent,
  StreamMessage,
  TriageResult,
} from "@/shared/models";
import { SCENARIO } from "@/lib/simulator/scenario";

/** Scripted story beats, for the "next beat" jump control. */
const BEAT_MINUTES = SCENARIO.map((b) => b.atMinute);

/* Design tokens — dark-surface palette validated for CVD + contrast.
   Status colors never carry meaning alone; every use pairs with a text label. */
const INK = { primary: "#ffffff", secondary: "#c3c2b7", muted: "#898781" };
const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" };

const SEVERITY_META: Record<IncidentSeverity, { label: string; color: string }> = {
  info: { label: "Info", color: INK.muted },
  low: { label: "Low", color: STATUS.good },
  medium: { label: "Medium", color: STATUS.warning },
  high: { label: "High", color: STATUS.serious },
  critical: { label: "Critical", color: STATUS.critical },
};

function densityState(pct: number): { label: string; color: string } {
  if (pct >= DENSITY_CRITICAL_PCT) return { label: "Critical", color: STATUS.critical };
  if (pct >= DENSITY_ALERT_PCT) return { label: "Alert", color: STATUS.serious };
  if (pct >= DENSITY_WATCH_PCT) return { label: "Watch", color: STATUS.warning };
  return { label: "OK", color: STATUS.good };
}

const PHASE_LABEL: Record<MatchPhase, string> = {
  "gates-open": "Gates open",
  kickoff: "First half",
  goal: "First half",
  halftime: "Halftime",
  "second-half": "Second half",
  fulltime: "Full time",
};

interface DashState {
  minute: number;
  phase: MatchPhase;
  events: StadiumEvent[];
  incidents: Incident[];
  zones: Record<string, { occupancy: number; densityPct: number }>;
  gates: Record<string, { entriesPerMinute: number; queueLength: number }>;
}

const INITIAL: DashState = {
  minute: 0,
  phase: "gates-open",
  events: [],
  incidents: [],
  zones: {},
  gates: {},
};

type Action =
  | { type: "reset" }
  | { type: "message"; msg: StreamMessage }
  | { type: "triage"; incidentId: string; triage: TriageResult }
  | { type: "status"; incidentId: string; status: Incident["status"] };

function reducer(state: DashState, action: Action): DashState {
  switch (action.type) {
    case "reset":
      return INITIAL;
    case "triage":
      return {
        ...state,
        incidents: state.incidents.map((i) =>
          i.id === action.incidentId ? { ...i, triage: action.triage, severity: action.triage.severity } : i,
        ),
      };
    case "status":
      return {
        ...state,
        incidents: state.incidents.map((i) =>
          i.id === action.incidentId ? { ...i, status: action.status } : i,
        ),
      };
    case "message": {
      const msg = action.msg;
      if (msg.kind === "clock") return { ...state, minute: msg.minute };
      if (msg.kind === "incident") return { ...state, incidents: [msg.incident, ...state.incidents] };
      if (msg.kind === "event") {
        const e = msg.event;
        const next: DashState = { ...state, events: [e, ...state.events].slice(0, 250) };
        if (e.type === "match") next.phase = e.phase === "goal" ? state.phase : e.phase;
        if (e.type === "crowd-density") {
          next.zones = { ...state.zones, [e.zoneId]: { occupancy: e.occupancy, densityPct: e.densityPct } };
        }
        if (e.type === "gate-flow") {
          next.gates = {
            ...state.gates,
            [e.gateId]: { entriesPerMinute: e.entriesPerMinute, queueLength: e.queueLength },
          };
        }
        return next;
      }
      return state;
    }
  }
}

/** Events worth sending to Gemini as context for one incident. */
function triageContext(incident: Incident, events: StadiumEvent[]): StadiumEvent[] {
  const related = events.filter((e) => {
    if ("zoneId" in e && e.zoneId === incident.zoneId) return true;
    if (e.type === "gate-flow") {
      const gate = DEMO_VENUE.gates.find((g) => g.id === e.gateId);
      if (gate?.zoneId === incident.zoneId) return true;
    }
    if (e.type === "radio-log" && Math.abs(e.atMinute - incident.createdAtMinute) <= 10) return true;
    return incident.sourceEventIds.includes(e.id);
  });
  const picked = (related.length > 0 ? related : events).slice(0, 15);
  return [...picked].reverse(); // chronological, most recent last
}

export default function Dashboard() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [tickMs, setTickMs] = useState(SIM_TICK_MS);
  const [startMinute, setStartMinute] = useState(0);
  const [connected, setConnected] = useState(false);
  const [triaging, setTriaging] = useState<Set<string>>(new Set());
  const [briefing, setBriefing] = useState<OpsBriefing | null>(null);
  const [handover, setHandover] = useState<HandoverReport | null>(null);
  const [doc, setDoc] = useState<
    | { kind: "briefing"; data: OpsBriefing }
    | { kind: "handover"; data: HandoverReport }
    | { kind: "loading"; label: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  useEffect(() => {
    dispatch({ type: "reset" });
    const source = new EventSource(`/api/stream?tickMs=${tickMs}&startMinute=${startMinute}`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (raw) => {
      try {
        dispatch({ type: "message", msg: JSON.parse(raw.data) as StreamMessage });
      } catch {
        // skip malformed frame
      }
    };
    return () => source.close();
  }, [tickMs, startMinute]);

  const nextBeat = BEAT_MINUTES.find((m) => m > state.minute);

  const openIncidents = state.incidents.filter((i) => i.status !== "resolved");
  const worstDensity = useMemo(
    () => Math.max(0, ...Object.values(state.zones).map((z) => z.densityPct)),
    [state.zones],
  );
  const insideEstimate = useMemo(
    () =>
      DEMO_VENUE.zones
        .filter((z) => z.kind === "seating" || z.kind === "concourse")
        .reduce((sum, z) => sum + (state.zones[z.id]?.occupancy ?? 0), 0),
    [state.zones],
  );

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
    setDoc({ kind: "loading", label: type === "briefing" ? "Writing ops briefing…" : "Writing handover…" });
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
      if (type === "briefing") {
        setBriefing(data as OpsBriefing);
        setDoc({ kind: "briefing", data });
      } else {
        setHandover(data as HandoverReport);
        setDoc({ kind: "handover", data });
      }
    } catch (err) {
      setDoc({ kind: "error", message: err instanceof Error ? err.message : "Generation failed" });
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

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#c3c2b7]">
      <header className="border-b border-white/10 bg-[#1a1a19]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3987e5]">
              MatchDay Command
            </p>
            <p className="text-xs text-[#898781]">
              {DEMO_VENUE.name}, {DEMO_VENUE.city} · simulated match day
            </p>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold text-white">{state.minute}&prime;</span>
            <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-[#c3c2b7]">
              {PHASE_LABEL[state.phase]}
            </span>
            <span className="text-xs" style={{ color: connected ? STATUS.good : STATUS.serious }}>
              {connected ? "● Live" : "○ Reconnecting"}
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-[#898781]">
              Sim speed
              <select
                value={tickMs}
                onChange={(e) => setTickMs(Number(e.target.value))}
                className="rounded border border-white/10 bg-[#0d0d0d] px-2 py-1 text-xs text-white"
              >
                <option value={2000}>1×</option>
                <option value={500}>4×</option>
              </select>
            </label>
            <button
              onClick={() => nextBeat !== undefined && setStartMinute(nextBeat)}
              disabled={nextBeat === undefined}
              title="Fast-forward the deterministic sim to the next scripted story beat"
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/5 disabled:opacity-40"
            >
              ⏭ Next beat{nextBeat !== undefined ? ` (${nextBeat}′)` : ""}
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
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[300px_minmax(0,1fr)_380px]">
        {/* Zones & gates */}
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
                    style={{ borderLeft: `2px solid ${qs.color}` }}
                  >
                    <p className="text-xs text-[#898781]">{gate.name}</p>
                    <p className="text-lg font-semibold text-white">{g?.entriesPerMinute ?? 0}</p>
                    <p className="text-[11px] text-[#898781]">
                      entries/min · queue {queue} · <span style={{ color: qs.color }}>{qs.label}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Occupancy">
            <StatRow label="Inside (est.)" value={insideEstimate.toLocaleString()} />
            <StatRow label="Worst zone density" value={`${worstDensity}%`} />
            <StatRow label="Open incidents" value={String(openIncidents.length)} />
          </Panel>
        </section>

        {/* Event ticker */}
        <Panel
          title="Live feed"
          className="order-3 lg:order-none"
          bodyClassName="max-h-[50vh] overflow-y-auto lg:max-h-[78vh]"
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

        {/* Incident queue */}
        <Panel
          title={`Incidents (${openIncidents.length} open)`}
          className="order-2 lg:order-none"
          bodyClassName="max-h-[60vh] overflow-y-auto lg:max-h-[78vh]"
        >
          {state.incidents.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#898781]">
              No incidents — feed nominal. Rules open incidents automatically.
            </p>
          ) : (
            <ul className="space-y-3">
              {state.incidents.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  busy={triaging.has(incident.id)}
                  onTriage={() => runTriage(incident)}
                  onStatus={(status) => dispatch({ type: "status", incidentId: incident.id, status })}
                />
              ))}
            </ul>
          )}
        </Panel>
      </main>

      {doc && <DocOverlay doc={doc} onClose={() => setDoc(null)} />}

      <footer className="mx-auto max-w-[1400px] px-5 pb-4 text-[11px] text-[#898781]">
        Simulated telemetry · AI output is generated from on-screen events only · Google PromptWars 2026
      </footer>
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-lg border border-white/10 bg-[#1a1a19] ${className}`}>
      <h2 className="border-b border-white/10 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#898781]">
        {title}
      </h2>
      <div className={`p-3.5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-xs text-[#898781]">{label}</span>
      <span className="text-base font-semibold text-white">{value}</span>
    </div>
  );
}

function EventLine({ event }: { event: StadiumEvent }) {
  const zone = (id: string) => DEMO_VENUE.zones.find((z) => z.id === id)?.name ?? id;
  const gate = (id: string) => DEMO_VENUE.gates.find((g) => g.id === id)?.name ?? id;
  switch (event.type) {
    case "match":
      return (
        <span className="text-white">
          <Tag>Match</Tag> {PHASE_LABEL[event.phase]}
          {event.phase === "goal" && " — GOAL"}
          {event.note ? <span className="text-[#898781]"> · {event.note}</span> : null}
        </span>
      );
    case "radio-log":
      return (
        <span>
          <Tag>{event.channel}</Tag> <span className="text-white">{event.from}:</span> {event.message}
        </span>
      );
    case "gate-flow":
      return (
        <span>
          <Tag>Gate</Tag> {gate(event.gateId)} · {event.entriesPerMinute}/min · queue{" "}
          {event.queueLength}
        </span>
      );
    case "crowd-density":
      return (
        <span>
          <Tag>Density</Tag> {zone(event.zoneId)} at {event.densityPct}%
        </span>
      );
    case "medical":
      return (
        <span>
          <Tag>Medical</Tag> {event.description} · {zone(event.zoneId)}
          {event.severityHint ? <span className="text-[#898781]"> · {event.severityHint}</span> : null}
        </span>
      );
    case "weather":
      return (
        <span>
          <Tag>Weather</Tag> {event.condition}, {event.tempC}°C
          {event.note ? <span className="text-[#898781]"> · {event.note}</span> : null}
        </span>
      );
  }
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#898781]">
      {children}
    </span>
  );
}

function IncidentCard({
  incident,
  busy,
  onTriage,
  onStatus,
}: {
  incident: Incident;
  busy: boolean;
  onTriage: () => void;
  onStatus: (status: Incident["status"]) => void;
}) {
  const sev = SEVERITY_META[incident.severity];
  const resolved = incident.status === "resolved";
  return (
    <li
      className={`rounded-lg border border-white/10 bg-[#0d0d0d] p-3 ${resolved ? "opacity-50" : ""}`}
      style={{ borderLeft: `2px solid ${sev.color}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs">
            <span className="font-semibold" style={{ color: sev.color }}>
              ● {sev.label}
            </span>{" "}
            <span className="text-[#898781]">
              · {incident.category} · {incident.createdAtMinute}&prime; · {incident.status}
            </span>
          </p>
          <p className="mt-0.5 text-sm font-medium text-white">{incident.title}</p>
        </div>
      </div>

      {incident.triage ? (
        <div className="mt-2 rounded border border-white/10 bg-[#1a1a19] p-2.5 text-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3987e5]">
            AI triage
          </p>
          <p className="mt-1 text-[#c3c2b7]">{incident.triage.summary}</p>
          <p className="mt-1 text-[#898781]">{incident.triage.rationale}</p>
          <ul className="mt-2 space-y-1.5">
            {incident.triage.recommendedActions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-px h-4 w-4 shrink-0 rounded-full border border-white/20 text-center text-[10px] leading-4 text-white">
                  {a.priority}
                </span>
                <span>
                  <span className="text-white">{a.action}</span>{" "}
                  <Tag>{a.assignTo}</Tag>
                </span>
              </li>
            ))}
          </ul>
          {incident.triage.escalate && (
            <p className="mt-2 font-semibold" style={{ color: STATUS.critical }}>
              ▲ Escalate to venue director
            </p>
          )}
        </div>
      ) : null}

      {!resolved && (
        <div className="mt-2 flex gap-2">
          {!incident.triage && (
            <button
              onClick={onTriage}
              disabled={busy}
              className="rounded bg-[#1c5cab] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#256abf] disabled:opacity-60"
            >
              {busy ? "Triaging…" : "AI triage"}
            </button>
          )}
          {incident.status === "open" && (
            <button
              onClick={() => onStatus("acknowledged")}
              className="rounded border border-white/10 px-2.5 py-1 text-xs text-white hover:bg-white/5"
            >
              Acknowledge
            </button>
          )}
          <button
            onClick={() => onStatus("resolved")}
            className="rounded border border-white/10 px-2.5 py-1 text-xs text-white hover:bg-white/5"
          >
            Resolve
          </button>
        </div>
      )}
    </li>
  );
}

function DocOverlay({
  doc,
  onClose,
}: {
  doc:
    | { kind: "briefing"; data: OpsBriefing }
    | { kind: "handover"; data: HandoverReport }
    | { kind: "loading"; label: string }
    | { kind: "error"; message: string };
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-[#1a1a19] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {doc.kind === "loading" && (
          <p className="py-10 text-center text-sm text-[#898781]">{doc.label}</p>
        )}
        {doc.kind === "error" && (
          <>
            <p className="text-sm font-semibold" style={{ color: STATUS.serious }}>
              ● Something went wrong
            </p>
            <p className="mt-2 text-sm text-[#c3c2b7]">{doc.message}</p>
          </>
        )}
        {doc.kind === "briefing" && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3987e5]">
              Ops briefing · minute {doc.data.generatedAtMinute}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">{doc.data.headline}</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm text-[#c3c2b7]">{doc.data.situation}</p>
            <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#898781]">
              Watch items
            </h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[#c3c2b7]">
              {doc.data.watchItems.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#898781]">
              Crowd outlook
            </h4>
            <p className="mt-1 text-sm text-[#c3c2b7]">{doc.data.crowdOutlook}</p>
          </>
        )}
        {doc.kind === "handover" && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3987e5]">
              Shift handover · {doc.data.shift}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-[#c3c2b7]">{doc.data.narrative}</p>
            <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#898781]">
              For the next shift
            </h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[#c3c2b7]">
              {doc.data.actionsForNextShift.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </>
        )}
        <button
          onClick={onClose}
          className="mt-5 rounded border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/5"
        >
          Close
        </button>
      </div>
    </div>
  );
}
