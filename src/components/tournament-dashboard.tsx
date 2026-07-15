"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DENSITY_ALERT_PCT } from "@/shared/constants";
import { ACCENT, PHASE_LABEL, STATUS, densityState } from "@/lib/theme";
import { TOURNAMENT_VENUES, venueSummary, type VenueSummary } from "@/lib/tournament";
import { insideEstimate, useMatchStream, worstDensityPct } from "@/lib/useMatchStream";
import { Panel, StatRow } from "@/components/primitives";

/**
 * Tournament supervisor: every venue on one wall. Meridian Arena is the live
 * shared simulation (same clock as the ops room); sister venues are derived
 * summaries with staggered kickoffs, labeled as simulated.
 */
export default function TournamentDashboard() {
  const { state, connected } = useMatchStream();

  const summaries: VenueSummary[] = useMemo(() => {
    return TOURNAMENT_VENUES.map((v) => {
      if (!v.live) return venueSummary(v, state.minute);
      // The live venue reports real numbers from the shared match.
      const worst = worstDensityPct(state.zones);
      const inside = insideEstimate(state.zones);
      return {
        venueId: v.id,
        localMinute: state.minute,
        phase: state.phase,
        phaseLabel: PHASE_LABEL[state.phase],
        worstDensityPct: worst,
        openIncidents: state.incidents.filter((i) => i.status !== "resolved").length,
        insideEst: inside,
        statusLine:
          worst >= DENSITY_ALERT_PCT
            ? "Concourse pressure — see ops room"
            : state.incidents.some((i) => i.status === "open")
              ? "Open incidents — ops engaged"
              : "Nominal",
      };
    });
  }, [state]);

  const totals = useMemo(
    () => ({
      inside: summaries.reduce((s, v) => s + v.insideEst, 0),
      incidents: summaries.reduce((s, v) => s + v.openIncidents, 0),
      worst: summaries.reduce((a, b) => (a.worstDensityPct >= b.worstDensityPct ? a : b)),
    }),
    [summaries],
  );

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#c3c2b7]">
      <header className="border-b border-white/10 bg-[#1a1a19]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <div>
            <h1
              className="text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: ACCENT }}
            >
              MatchDay Command · Tournament
            </h1>
            <p className="text-xs text-[#898781]">
              Match day 4 · {TOURNAMENT_VENUES.length} venues · Madhya Pradesh cluster
            </p>
          </div>
          <span
            role="status"
            aria-live="polite"
            className="text-xs"
            style={{ color: connected ? STATUS.good : STATUS.serious }}
          >
            {connected ? "● Live" : "○ Reconnecting"}
          </span>
          <div className="ml-auto">
            <Link
              href="/"
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/5"
            >
              ← Ops room
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 px-5 py-4">
        <Panel title="Tournament pulse">
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-3">
            <StatRow label="Fans inside (all venues)" value={totals.inside.toLocaleString()} />
            <StatRow label="Open incidents" value={String(totals.incidents)} />
            <StatRow
              label="Highest pressure"
              value={`${TOURNAMENT_VENUES.find((v) => v.id === totals.worst.venueId)?.name ?? ""} · ${totals.worst.worstDensityPct}%`}
            />
          </div>
        </Panel>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TOURNAMENT_VENUES.map((venue) => {
            const s = summaries.find((x) => x.venueId === venue.id)!;
            const d = densityState(s.worstDensityPct);
            const card = (
              <div
                className={`h-full rounded-lg border border-white/10 bg-[#1a1a19] p-4 ${venue.live ? "hover:border-white/25" : ""}`}
                style={{ borderTop: `2px solid ${d.color}` }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{venue.name}</p>
                    <p className="text-[11px] text-[#898781]">
                      {venue.city} · {venue.capacity.toLocaleString()} cap
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={
                      venue.live
                        ? { color: STATUS.good, border: `1px solid ${STATUS.good}66` }
                        : { color: "#898781", border: "1px solid rgba(255,255,255,0.1)" }
                    }
                  >
                    {venue.live ? "● LIVE" : "simulated"}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-white">{s.localMinute}&prime;</span>
                  <span className="text-xs text-[#898781]">{s.phaseLabel}</span>
                </div>

                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#898781]">Worst density</span>
                    <span>
                      <span className="font-semibold text-white">{s.worstDensityPct}%</span>{" "}
                      <span style={{ color: d.color }}>{d.label}</span>
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full"
                    style={{ backgroundColor: `${d.color}33` }}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${Math.min(s.worstDensityPct, 100)}%`,
                        backgroundColor: d.color,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#898781]">Inside (est.)</span>
                    <span className="tabular-nums text-white">{s.insideEst.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#898781]">Open incidents</span>
                    <span
                      className="font-semibold tabular-nums"
                      style={{ color: s.openIncidents > 0 ? STATUS.warning : STATUS.good }}
                    >
                      {s.openIncidents}
                    </span>
                  </div>
                </div>

                <p className="mt-3 border-t border-white/5 pt-2 text-[11px] text-[#c3c2b7]">
                  {s.statusLine}
                </p>
                {venue.live && (
                  <p className="mt-1 text-[11px]" style={{ color: ACCENT }}>
                    Open ops room →
                  </p>
                )}
              </div>
            );
            return venue.live ? (
              <Link key={venue.id} href="/" className="block">
                {card}
              </Link>
            ) : (
              <div key={venue.id}>{card}</div>
            );
          })}
        </div>
      </main>

      <footer className="mx-auto max-w-[1400px] px-5 pb-4 text-[11px] text-[#898781]">
        Meridian Arena is the live shared simulation; sister venues are derived summaries · Google
        PromptWars 2026
      </footer>
    </div>
  );
}
