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
- `src/lib/simulator/detector.ts` — rule-based incident detection (density/queue/medical/weather thresholds). Rules open incidents; Gemini only fills `triage`.
- `src/lib/gemini.ts` — all Gemini calls go through `generateJson()` (structured output). Model from `GEMINI_MODEL` env, default `gemini-3.5-flash` (2.5-flash is retired for new API keys as of mid-2026).
- `src/app/api/stream` — SSE feed; each connection runs its own deterministic sim (seed 42), `?tickMs=` controls pace. `api/triage` and `api/briefing` (+`?type=handover`) are the Gemini endpoints; the client posts its accumulated state, so the server is stateless (`src/lib/store.ts` is currently unused scaffolding).
- `src/components/dashboard.tsx` — ops control room UI (`/`). `src/components/staff-dashboard.tsx` — staff console (`/staff`), a second persona: weather + AI demand plan + role-grouped task board. Both share `src/lib/useMatchStream.ts` (SSE→state hook), `src/lib/theme.ts` (CVD/contrast-validated dark tokens — status colors always paired with a text label), and `src/components/primitives.tsx` (Panel/Tag/StatRow).
- `src/lib/weather/client.ts` — live weather via Open-Meteo (keyless) with a deterministic simulated fallback; `/api/weather` exposes it. `src/lib/traffic/model.ts` — deterministic approach-traffic/parking model (`trafficAt(minute, phase)`), computed client-side; geo fixtures pinned near `VENUE_LOCATION` (Indore).
- `src/components/venue-map.tsx` — Google Maps + live TrafficLayer when `MAPS_API_KEY` is set (fetched at runtime from `/api/config`, not build-inlined), SVG schematic fallback otherwise. Google objects are locally `any` (no `@types/google.maps` dep).
- `/api/demand` — Gemini demand forecast: weather + attendance + phase → stocking plan (`DemandPlan`) + prep `StaffTask`s. `/api/config` — runtime bootstrap (maps key presence). All AI routes stay stateless; the client posts accumulated state. Gemini errors go through `geminiErrorMessage()` for UI-friendly text.
- `/api/copilot` — agentic chat: history + snapshot in; text and/or `toolCalls` out (open_incident / dispatch_task / generate_briefing). Tool calls execute CLIENT-side in `dashboard.tsx#runToolCall`; the system prompt enforces "act only on instruction, answer questions with text".
- `/api/tasks` (GET/POST) + `src/lib/store.ts` — in-memory dispatch queue; staff console polls every 15s. Single-instance by design.
- `src/lib/predict.ts` — `computeWarnings(events, minute)`: linear trend projection to density/queue thresholds (client-side, "Early warnings" panel; feeds copilot snapshot).
- `src/components/voice-radio.tsx` — Web Speech API push-to-talk (Chrome/Edge; hides on unsupported browsers); transcript becomes a radio-log event in local state.

## Conventions

- Simulation clock is **minutes since gates open** (`atMinute`), never wall time — keeps the demo deterministic and lets us fast-forward.
- Events are raw signals; **Incidents** are operator-facing clusters of events. Detection rules open incidents; Gemini only fills `triage`.
- Gemini prompts must instruct the model to use only supplied telemetry (no invented facts) and to name specific gates/zones/channels.
- Secrets: `.env.local` only (gitignored). `GEMINI_API_KEY` required for triage/briefing routes; the rest of the app must work without it.

## Competition constraints

- Solo participant (PromptWars rule) — keep scope demoable, prefer polish over features.
- Public repo: github.com/Sarthak195/matchday-command. Demo must survive judging with zero external dependencies → all live data is simulated.
