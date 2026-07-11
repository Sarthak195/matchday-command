# MatchDay Command — project memory

AI incident command copilot for stadium/tournament operations. Solo entry for **Google PromptWars** (theme: Smart Stadiums & Tournament Operations, July 2026). Judged as a "vibe coding" competition: working deployed demo > breadth. Differentiator vs. other entries: ops-room copilot, **not** a fan chatbot.

## Commands

- `npm run dev` — dev server on :3000
- `npm run typecheck` — `tsc --noEmit` (run after any model change)
- `npm run build` — production build (standalone output for Docker)
- Deploy: `gcloud run deploy matchday-command --source . --region asia-south1 --max-instances 1`

## Architecture map

- `src/shared/models/` — **single source of truth** for all domain types (events, incidents, briefings, SSE protocol). UI, API routes, and simulator all import from here. Add new signal types to the `StadiumEvent` discriminated union first, then handle exhaustively.
- `src/shared/constants.ts` — demo venue (`DEMO_VENUE`, fictional "Meridian Arena, Indore"), density thresholds, sim pacing.
- `src/lib/simulator/` — tick-based engine; `scenario.ts` is the scripted demo storyline (clock = minutes since gates open, kickoff at minute 60). The scenario IS the demo script — keep it aligned with `docs/DEMO_SCRIPT.md`.
- `src/lib/gemini.ts` — all Gemini calls go through `generateJson()` (structured output). Model from `GEMINI_MODEL` env, default `gemini-2.5-flash`.
- `src/lib/store.ts` — in-memory `OpsState`; deliberate single-instance design (Cloud Run `--max-instances 1`). Don't add a database without a reason.
- `src/app/api/stream` — SSE feed of `StreamMessage`s; `api/triage` — Gemini incident triage (working); `api/briefing` — stub (501), next up.

## Conventions

- Simulation clock is **minutes since gates open** (`atMinute`), never wall time — keeps the demo deterministic and lets us fast-forward.
- Events are raw signals; **Incidents** are operator-facing clusters of events. Detection rules open incidents; Gemini only fills `triage`.
- Gemini prompts must instruct the model to use only supplied telemetry (no invented facts) and to name specific gates/zones/channels.
- Secrets: `.env.local` only (gitignored). `GEMINI_API_KEY` required for triage/briefing routes; the rest of the app must work without it.

## Competition constraints

- Solo participant (PromptWars rule) — keep scope demoable, prefer polish over features.
- Public repo: github.com/Sarthak195/matchday-command. Demo must survive judging with zero external dependencies → all live data is simulated.
