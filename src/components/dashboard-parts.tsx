"use client";

import { DEMO_VENUE } from "@/shared/constants";
import type {
  HandoverReport,
  Incident,
  MatchPhase,
  OpsBriefing,
  StadiumEvent,
} from "@/shared/models";
import { ACCENT, CRITICAL_TEXT, PHASE_LABEL, SEVERITY_META, STATUS } from "@/lib/theme";
import { Tag } from "@/components/primitives";
import { Modal } from "@/components/modal";

/** One line of the live telemetry feed, rendered by signal type. */
export function EventLine({ event }: { event: StadiumEvent }) {
  const zone = (id: string) => DEMO_VENUE.zones.find((z) => z.id === id)?.name ?? id;
  const gate = (id: string) => DEMO_VENUE.gates.find((g) => g.id === id)?.name ?? id;
  const phaseLabel = (p: MatchPhase) => PHASE_LABEL[p];
  switch (event.type) {
    case "match":
      return (
        <span className="text-white">
          <Tag>Match</Tag> {phaseLabel(event.phase)}
          {event.phase === "goal" && " — GOAL"}
          {event.note ? <span className="text-[#898781]"> · {event.note}</span> : null}
        </span>
      );
    case "radio-log":
      return (
        <span>
          <Tag>{event.channel}</Tag> <span className="text-white">{event.from}:</span>{" "}
          {event.message}
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
          {event.severityHint ? (
            <span className="text-[#898781]"> · {event.severityHint}</span>
          ) : null}
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

/** One incident in the ops queue: severity, AI triage, and status controls. */
export function IncidentCard({
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
          <p
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: ACCENT }}
          >
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
                  <span className="text-white">{a.action}</span> <Tag>{a.assignTo}</Tag>
                </span>
              </li>
            ))}
          </ul>
          {incident.triage.escalate && (
            <p className="mt-2 font-semibold" style={{ color: CRITICAL_TEXT }}>
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

/** Modal for a generated ops briefing / handover, or a loading/error state. */
export function DocOverlay({
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
    <Modal
      onClose={onClose}
      label="Ops document"
      className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-[#1a1a19] p-5"
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
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: ACCENT }}
          >
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
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: ACCENT }}
          >
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
    </Modal>
  );
}
