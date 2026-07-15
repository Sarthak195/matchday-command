"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEMO_VENUE, EXPECTED_ATTENDANCE } from "@/shared/constants";
import type {
  DemandPlan,
  Incident,
  StaffRole,
  StaffTask,
  SupplyItem,
  TaskStatus,
  WeatherForecast,
} from "@/shared/models";
import { ACCENT, CONGESTION_COLOR, INK, PHASE_LABEL, STATUS } from "@/lib/theme";
import { trafficAt } from "@/lib/traffic/model";
import { useMatchStream } from "@/lib/useMatchStream";
import { Panel, Tag } from "@/components/primitives";

const ROLE_LABEL: Record<StaffRole, string> = {
  catering: "Catering",
  concessions: "Concessions",
  stewarding: "Stewarding",
  security: "Security",
  medical: "Medical",
  facilities: "Facilities",
  traffic: "Traffic",
  logistics: "Logistics",
};

const STATUS_FLOW: TaskStatus[] = ["pending", "acked", "in-progress", "done"];
const NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = {
  pending: "acked",
  acked: "in-progress",
  "in-progress": "done",
  done: null,
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  acked: "Acknowledged",
  "in-progress": "In progress",
  done: "Done",
};

function itemLabel(item: SupplyItem): string {
  return item.replace(/-/g, " ");
}

function priorityFromSeverity(sev: Incident["severity"]): 1 | 2 | 3 {
  if (sev === "critical" || sev === "high") return 1;
  if (sev === "medium") return 2;
  return 3;
}

function roleForCategory(cat: Incident["category"]): StaffRole {
  switch (cat) {
    case "medical":
      return "medical";
    case "crowd":
      return "stewarding";
    case "security":
      return "security";
    case "weather":
    case "facilities":
      return "facilities";
    default:
      return "logistics";
  }
}

export default function StaffDashboard() {
  const { state, connected } = useMatchStream();

  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [demand, setDemand] = useState<{ plan: DemandPlan; tasks: StaffTask[] } | null>(null);
  const [demandBusy, setDemandBusy] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, TaskStatus>>({});
  const [dispatched, setDispatched] = useState<StaffTask[]>([]);
  const demandRequested = useRef(false);

  // Poll the server dispatch queue (copilot/ops-side task orders).
  useEffect(() => {
    const load = () =>
      fetch("/api/tasks")
        .then((r) => r.json())
        .then((d: { tasks?: StaffTask[] }) => setDispatched(d.tasks ?? []))
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const traffic = useMemo(() => trafficAt(state.minute, state.phase), [state.minute, state.phase]);

  // Live weather once on mount.
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

  async function fetchDemand() {
    if (!forecast) return;
    setDemandBusy(true);
    try {
      const res = await fetch("/api/demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minute: state.minute,
          phase: state.phase,
          attendance: EXPECTED_ATTENDANCE,
          weather: forecast,
        }),
      });
      const data = await res.json();
      if (res.ok) setDemand(data);
    } finally {
      setDemandBusy(false);
    }
  }

  // Auto-generate the demand plan once weather is in.
  useEffect(() => {
    if (forecast && !demandRequested.current) {
      demandRequested.current = true;
      void fetchDemand();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecast]);

  // Derive the full task list from every source. Ids are stable so status
  // overrides survive live re-derivation each minute.
  const tasks = useMemo<StaffTask[]>(() => {
    const out: StaffTask[] = [];

    for (const inc of state.incidents.filter((i) => i.status !== "resolved")) {
      out.push({
        id: `task-inc-${inc.id}`,
        createdAtMinute: inc.createdAtMinute,
        role: roleForCategory(inc.category),
        title: inc.title,
        detail:
          inc.triage?.summary ?? `Respond to ${inc.category} incident. Triage pending in ops.`,
        priority: priorityFromSeverity(inc.severity),
        origin: "incident",
        status: "pending",
      });
    }

    for (const adv of traffic.advisories) {
      out.push({
        id: `task-${adv.id.replace(/-\d+$/, "")}`,
        createdAtMinute: state.minute,
        role: "traffic",
        title: adv.severity === "warning" ? "Traffic action" : "Traffic note",
        detail: adv.message,
        priority: adv.severity === "warning" ? 2 : 3,
        origin: "traffic",
        status: "pending",
      });
    }

    if (forecast) {
      const wet =
        forecast.precipProbPct >= 60 ||
        forecast.condition === "rain" ||
        forecast.condition === "storm";
      const hot = forecast.condition === "heat" || forecast.tempC >= 34;
      const cold = forecast.condition === "cold" || forecast.tempC <= 12;
      if (wet)
        out.push({
          id: "task-wx-wet",
          createdAtMinute: state.minute,
          role: "facilities",
          title: "Wet-weather readiness",
          detail:
            "Open poncho points at both concourses, cover walkways, check drainage and roof runoff.",
          priority: 1,
          origin: "weather",
          status: "pending",
          dueBy: "before kickoff",
        });
      if (hot)
        out.push({
          id: "task-wx-hot",
          createdAtMinute: state.minute,
          role: "concessions",
          title: "Heat readiness",
          detail:
            "Push water and cold drinks to forward stands, run misting fans, brief medical on heat cases.",
          priority: 1,
          origin: "weather",
          status: "pending",
          dueBy: "before kickoff",
        });
      if (cold)
        out.push({
          id: "task-wx-cold",
          createdAtMinute: state.minute,
          role: "catering",
          title: "Cold readiness",
          detail: "Open hot-beverage and hot-food stands, stage blanket loans at guest services.",
          priority: 2,
          origin: "weather",
          status: "pending",
        });
    }

    if (demand) out.push(...demand.tasks);
    out.push(...dispatched);

    return out;
  }, [state.incidents, state.minute, traffic, forecast, demand, dispatched]);

  const statusOf = (t: StaffTask): TaskStatus => overrides[t.id] ?? t.status;

  function advance(t: StaffTask) {
    const next = NEXT_STATUS[statusOf(t)];
    if (next) setOverrides((o) => ({ ...o, [t.id]: next }));
  }

  const activeTasks = tasks.filter((t) => statusOf(t) !== "done");
  const byRole = useMemo(() => {
    const groups = new Map<StaffRole, StaffTask[]>();
    for (const t of activeTasks) {
      const arr = groups.get(t.role) ?? [];
      arr.push(t);
      groups.set(t.role, arr);
    }
    for (const arr of groups.values()) arr.sort((a, b) => a.priority - b.priority);
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [activeTasks]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#c3c2b7]">
      <header className="border-b border-white/10 bg-[#1a1a19]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <div>
            <h1
              className="text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: ACCENT }}
            >
              MatchDay Command · Staff console
            </h1>
            <p className="text-xs text-[#898781]">{DEMO_VENUE.name} · your tasks for this shift</p>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold text-white">{state.minute}&prime;</span>
            <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs">
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
            <button
              onClick={fetchDemand}
              disabled={demandBusy || !forecast}
              className="rounded bg-[#1c5cab] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-60"
            >
              {demandBusy ? "Planning…" : "↻ Refresh demand plan"}
            </button>
            <Link
              href="/"
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/5"
            >
              Ops view →
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="space-y-4">
          <Panel title="Weather">
            {forecast ? (
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-semibold text-white">
                    {Math.round(forecast.tempC)}°C
                  </span>
                  <span className="text-sm capitalize text-[#c3c2b7]">{forecast.condition}</span>
                </div>
                <p className="mt-1 text-xs text-[#898781]">{forecast.summary}</p>
                <p className="mt-1 text-[11px] text-[#898781]">
                  {forecast.source === "live" ? "● Live (Open-Meteo)" : "● Simulated fallback"}
                </p>
                <div className="mt-3 flex gap-2">
                  {forecast.horizon.map((h) => (
                    <div
                      key={h.label}
                      className="flex-1 rounded border border-white/10 bg-[#0d0d0d] p-2 text-center"
                    >
                      <p className="text-[10px] text-[#898781]">{h.label}</p>
                      <p className="text-sm font-semibold text-white">{Math.round(h.tempC)}°</p>
                      <p className="text-[10px] capitalize text-[#898781]">{h.condition}</p>
                      <p
                        className="text-[10px]"
                        style={{ color: h.precipProbPct >= 50 ? STATUS.warning : INK.muted }}
                      >
                        {h.precipProbPct}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-[#898781]">Loading forecast…</p>
            )}
          </Panel>

          <Panel
            title="Demand forecast"
            action={
              demand ? (
                <span className="text-[10px] text-[#898781]">
                  min {demand.plan.generatedAtMinute}
                </span>
              ) : undefined
            }
          >
            {demand ? (
              <div>
                <p className="mb-2 text-xs text-[#c3c2b7]">{demand.plan.summary}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-[#898781]">
                        <th className="py-1 font-medium">Item</th>
                        <th className="py-1 text-right font-medium tabular-nums">Need</th>
                        <th className="py-1 text-right font-medium tabular-nums">Stock</th>
                        <th className="py-1 text-right font-medium tabular-nums">Gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...demand.plan.lines]
                        .sort((a, b) => b.gap - a.gap)
                        .map((l) => (
                          <tr key={l.item} className="border-t border-white/5">
                            <td className="py-1 capitalize text-[#c3c2b7]">{itemLabel(l.item)}</td>
                            <td className="py-1 text-right tabular-nums text-white">
                              {l.predictedUnits.toLocaleString()}
                            </td>
                            <td className="py-1 text-right tabular-nums text-[#898781]">
                              {l.currentStock.toLocaleString()}
                            </td>
                            <td
                              className="py-1 text-right font-semibold tabular-nums"
                              style={{ color: l.gap > 0 ? STATUS.serious : STATUS.good }}
                            >
                              {l.gap > 0 ? `+${l.gap.toLocaleString()}` : "ok"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-[#898781]">
                {forecast ? "Generating demand plan…" : "Waiting for weather…"}
              </p>
            )}
          </Panel>

          <Panel title="Traffic & parking">
            <ul className="space-y-1.5 text-xs">
              {traffic.corridors.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span className="text-[#c3c2b7]">{c.name}</span>
                  <span className="tabular-nums" style={{ color: CONGESTION_COLOR[c.congestion] }}>
                    {c.congestion} · {c.etaMin}′
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </section>

        <section>
          <Panel title={`Task board · ${activeTasks.length} active`} bodyClassName="min-h-[60vh]">
            {byRole.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#898781]">
                No open tasks — the system dispatches prep, stocking, traffic, and incident tasks
                here as they arise.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {byRole.map(([role, roleTasks]) => (
                  <div key={role}>
                    <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#c3c2b7]">
                      {ROLE_LABEL[role]}
                      <span className="rounded-full bg-white/5 px-1.5 text-[10px] text-[#898781]">
                        {roleTasks.length}
                      </span>
                    </h3>
                    <ul className="space-y-2">
                      {roleTasks.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          status={statusOf(t)}
                          onAdvance={() => advance(t)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>
      </main>

      <footer className="mx-auto max-w-[1400px] px-5 pb-4 text-[11px] text-[#898781]">
        Tasks dispatched from live incidents, weather, traffic, and the AI demand plan · Google
        PromptWars 2026
      </footer>
    </div>
  );
}

const ORIGIN_COLOR: Record<StaffTask["origin"], string> = {
  incident: STATUS.serious,
  weather: ACCENT,
  traffic: STATUS.warning,
  demand: STATUS.good,
  match: INK.muted,
  copilot: "#9085e9", // violet — ops-side AI dispatch
  emergency: STATUS.critical,
};

function TaskCard({
  task,
  status,
  onAdvance,
}: {
  task: StaffTask;
  status: TaskStatus;
  onAdvance: () => void;
}) {
  const next = NEXT_STATUS[status];
  const stepIndex = STATUS_FLOW.indexOf(status);
  return (
    <li
      className="rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5"
      style={{ borderLeft: `2px solid ${ORIGIN_COLOR[task.origin]}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-white">{task.title}</p>
        <span
          className="shrink-0 rounded-full border border-white/20 px-1.5 text-[10px] leading-4 text-[#898781]"
          title="priority"
        >
          P{task.priority}
        </span>
      </div>
      <p className="mt-1 text-xs text-[#898781]">{task.detail}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] text-[#898781]">
          <Tag>{task.origin}</Tag>
          {task.dueBy ? <span>· {task.dueBy}</span> : null}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-[#898781]">
            {stepIndex + 1}/{STATUS_FLOW.length}
          </span>
          {next ? (
            <button
              onClick={onAdvance}
              className="rounded border border-white/10 px-2 py-0.5 text-[11px] text-white hover:bg-white/5"
            >
              {status === "pending" ? "Ack" : status === "acked" ? "Start" : "Done"}
            </button>
          ) : (
            <span className="text-[11px]" style={{ color: STATUS.good }}>
              ✓ {STATUS_LABEL[status]}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
