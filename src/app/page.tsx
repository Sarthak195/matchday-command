import { DEMO_VENUE } from "@/shared/constants";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
        MatchDay Command
      </p>
      <h1 className="mt-3 text-3xl font-semibold leading-tight">
        AI incident command for match-day operations
      </h1>
      <p className="mt-4 text-lg text-slate-400">
        A control-room copilot for {DEMO_VENUE.name}: live gate, crowd, radio, medical, and
        weather signals stream in; Gemini triages incidents, recommends actions, and writes
        the ops briefings and shift handovers.
      </p>

      <section className="mt-10 rounded-lg border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Build status — scaffold
        </h2>
        <ul className="mt-4 space-y-2 text-slate-300">
          <li>✅ Shared models (events, incidents, briefings, SSE protocol)</li>
          <li>✅ Match-day simulator skeleton with scripted scenario</li>
          <li>✅ Gemini structured-output wrapper + triage endpoint</li>
          <li>⬜ Live dashboard consuming /api/stream</li>
          <li>⬜ Incident feed with one-click AI triage</li>
          <li>⬜ Ops briefing + shift handover generator</li>
        </ul>
      </section>

      <p className="mt-8 text-sm text-slate-500">
        Built solo for Google PromptWars · Smart Stadiums &amp; Tournament Operations
      </p>
    </main>
  );
}
