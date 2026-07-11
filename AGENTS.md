# AGENTS.md — start here

This file is the entrypoint for AI coding agents working on **MatchDay Command**.
`CLAUDE.md` is the compact quick-reference; the deep documentation lives in
[`docs/agents/`](docs/agents/). Read the doc that matches your task before editing:

| Doc | Read it when you are… |
|---|---|
| [product-context.md](docs/agents/product-context.md) | making product/scope decisions, writing copy, preparing the demo or submission |
| [architecture.md](docs/agents/architecture.md) | changing data flow, adding a view/endpoint, or unsure where something lives |
| [domain-models.md](docs/agents/domain-models.md) | touching anything in `src/shared/` — the type vocabulary everything obeys |
| [simulation.md](docs/agents/simulation.md) | changing the simulator, scenario beats, incident detection, or the shared live match |
| [ai-layer.md](docs/agents/ai-layer.md) | touching Gemini prompts, schemas, function calling, or adding an AI feature |
| [frontend.md](docs/agents/frontend.md) | editing views/components, design tokens, or client state |
| [api-reference.md](docs/agents/api-reference.md) | calling or modifying any `/api/*` route (request/response shapes + curl examples) |
| [infrastructure.md](docs/agents/infrastructure.md) | deploying, managing GCP projects/keys/env vars, or debugging prod |
| [conventions-and-gotchas.md](docs/agents/conventions-and-gotchas.md) | before your first edit, and whenever something behaves strangely |

## What this project is (one paragraph)

A solo **Google PromptWars** competition entry (theme: *Smart Stadiums & Tournament
Operations*): an AI copilot for the stadium **operations control room** — deliberately
not a fan chatbot. One server-side simulated match day streams telemetry over SSE to
three synced views (ops `/`, staff `/staff`, tournament `/tournament`); Gemini triages
incidents, writes briefings/handovers, forecasts weather-driven supply demand,
plans evacuations, and acts agentically through a function-calling copilot. Live at
https://matchday-command-1069049902747.asia-south1.run.app, repo at
https://github.com/Sarthak195/matchday-command.

## Golden rules

1. **`src/shared/models/` is the single source of truth.** Add/modify types there
   first; the compiler finds every consumer. Never duplicate a domain type locally.
2. **The simulation is deterministic.** No `Math.random()` outside the seeded PRNG in
   the engine, no wall-clock time in sim logic. The demo must replay identically.
3. **Rules open incidents; Gemini only fills `triage`.** Never let the model invent
   incidents or telemetry (system prompts enforce "supplied state only").
4. **Everything degrades gracefully.** Any external dependency (Gemini, Maps,
   Open-Meteo, mic) must have a fallback or a friendly error. The demo can never break
   because a key or network is missing.
5. **Server AI routes are stateless** (client posts its accumulated state) — the only
   server state is the shared match (`live.ts`) and the task queue (`store.ts`), both
   in-memory and safe only because Cloud Run runs `--max-instances 1`.
6. **Status colors never carry meaning alone** — always pair with a text label
   (accessibility-validated dark palette in `src/lib/theme.ts`).
7. **Verify before shipping:** `npm run typecheck && npm run build`, then exercise the
   affected route/page (see api-reference.md for curl recipes). Deploys go through
   `gcloud run deploy matchday-command --source . --region asia-south1` — see
   infrastructure.md for the full checklist and env-var traps.

## Quick facts

- Next.js 15 (App Router) · TypeScript strict · Tailwind v4 · `@google/genai`
- Node 22 · build: `npm run build` · typecheck: `npm run typecheck` · dev: `npm run dev`
- Sim clock: minutes since gates open; kickoff 60′, halftime 105′, full time 165′
- Gemini model: `gemini-3.5-flash` (env `GEMINI_MODEL`); free tier ≈ 250 req/day — never call Gemini on a timer
- GCP: service `matchday-command`, project `matchday-command-2624`, region `asia-south1`
