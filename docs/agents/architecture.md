# Architecture

## One-sentence design

One server-side deterministic **simulated match** broadcasts typed telemetry over
**SSE** to three synced client views; **rule-based detection** clusters events into
incidents; **Gemini** (structured output + function calling) triages, briefs,
forecasts demand, plans evacuations, and acts through a copilot; a **task queue**
carries orders from the ops side to the staff console.

## Data flow

```
                        ┌──────────────────────── server ────────────────────────┐
  SCENARIO beats ──▶ SimulationEngine.tick() ──▶ StadiumEvent[]                  │
                        │        │                                               │
                        │        ▼                                               │
                        │   IncidentDetector.process() ──▶ Incident[]            │
                        │        │                                               │
                        ▼        ▼                                               │
                LiveMatch (singleton) ── broadcast ──▶ SSE /api/stream ──▶ every client
                        ▲                                                        │
      POST /api/sim ────┘ (global speed / jump / restart)                        │
                                                                                 │
  client state (useMatchStream reducer) ──▶ POST /api/triage ────▶ Gemini        │
       │  accumulates events/incidents      POST /api/briefing ──▶ Gemini        │
       │  client-side: predict.ts warnings, POST /api/demand ────▶ Gemini        │
       │  traffic model, copilot snapshot   POST /api/copilot ───▶ Gemini + tools│
       │                                    POST /api/emergency ─▶ Gemini ─┐     │
       │                                                                   ▼     │
       └────────── staff console polls ◀── GET /api/tasks ◀── store.ts (addTask) │
                                                                                 │
  GET /api/weather ──▶ Open-Meteo (live) or simulated fallback                   │
  GET /api/config  ──▶ { mapsEnabled, mapsApiKey } (runtime, not build-inlined)  │
```

## Layer map (where things live)

| Layer | Path | Contents |
|---|---|---|
| Domain types | `src/shared/models/` | THE vocabulary: events, incidents, briefings, stream protocol, weather, demand, staff, traffic, emergency. Barrel: `index.ts` |
| Domain constants | `src/shared/constants.ts` | `DEMO_VENUE`, `VENUE_LOCATION`, thresholds, sim pacing, `EXPECTED_ATTENDANCE` |
| Simulation | `src/lib/simulator/` | `engine.ts` (tick + noise), `scenario.ts` (scripted beats), `detector.ts` (incident rules), `live.ts` (shared singleton) |
| Analytics | `src/lib/predict.ts` | client-side trend projection → early warnings |
| External data | `src/lib/weather/client.ts`, `src/lib/traffic/model.ts` | Open-Meteo + fallback; deterministic traffic/parking model |
| AI | `src/lib/gemini.ts` + `src/app/api/{triage,briefing,demand,copilot,emergency}/route.ts` | one wrapper, five endpoints |
| Server state | `src/lib/store.ts` (task queue), `src/lib/simulator/live.ts` (match) | in-memory, single-instance by design |
| Client state | `src/lib/useMatchStream.ts` | SSE → reducer; shared by all views |
| UI | `src/components/` + `src/app/{page,staff,tournament}` | `dashboard.tsx` (ops), `staff-dashboard.tsx`, `tournament-dashboard.tsx`, `copilot.tsx`, `venue-map.tsx`, `voice-radio.tsx`, `primitives.tsx`, theme in `src/lib/theme.ts` |
| Tournament | `src/lib/tournament.ts` | sister-venue derived summaries |

## The six load-bearing decisions

1. **Events vs incidents.** Events are cheap raw signals (discriminated union on
   `type`). An `Incident` is an operator-facing object with a lifecycle
   (`open → acknowledged → resolving → resolved`). Detection rules (or the operator,
   or the copilot) open incidents; **Gemini only ever fills the `triage` field**.

2. **One shared match, global controls.** `live.ts` holds a globalThis singleton
   (survives dev HMR). Every SSE connection subscribes; late joiners get a catch-up
   burst (last 250 events + all incidents + clock). Controls are global on purpose —
   it's a control room, not per-viewer replay. Consequence: anything per-viewer
   (triage results, voice events, copilot incidents, emergency posture) lives in
   client state only; anything cross-view must go through the server (task queue).

3. **Stateless AI routes.** The client accumulates state from the stream and POSTs
   the relevant slice (snapshot/contextEvents) to each AI endpoint. This keeps the
   server trivially scalable in principle and makes every AI call reproducible from
   its request body. The two in-memory exceptions (match, tasks) are why Cloud Run
   runs `--max-instances 1`.

4. **Deterministic simulation as a feature.** Seeded LCG PRNG, scripted beats, clock
   in sim-minutes. Same story every run → rehearsable demo, reproducible bugs,
   fast-forward (`jump`) can rebuild identical state instantly.

5. **Graceful degradation everywhere.** Maps key absent → SVG schematic. Open-Meteo
   down → simulated monsoon forecast (aligned with the 75′ storm beat). Gemini
   missing/exhausted → friendly error via `geminiErrorMessage()`, rest of app
   unaffected. Mic unsupported → button hides.

6. **Design tokens with validated accessibility.** Dark-only UI; status palette
   (`theme.ts`) is CVD/contrast-validated; color never carries meaning without a
   text label. See frontend.md before changing any color.

## Request lifecycle examples

**A crowd-density event reaches the ops screen:** engine tick (every `SIM_TICK_MS`,
default 2000ms) → `LiveMatch.step()` pushes to event log + broadcasts
`{kind:"event"}` → SSE `data:` line → `useMatchStream` reducer dedupes by id, updates
`state.zones` → zone meter re-renders; `predict.ts` recomputes warnings via `useMemo`.

**Operator says "task catering to start hot food prep" in the copilot:** client sends
chat history + `copilotSnapshot()` → `/api/copilot` builds system prompt with the
snapshot inlined, calls Gemini with 3 function declarations → response contains
`toolCalls:[{name:"dispatch_task", args}]` → client `runToolCall()` POSTs
`/api/tasks` → `store.addTask()` → staff console's 15s poll renders it under
Catering with a violet "copilot" origin stripe.

## What is intentionally NOT here

- No database (in-memory is a documented trade-off; Firestore is the escape hatch).
- No auth (demo; would be first production-hardening step).
- No tests (competition velocity; verification is typecheck + build + curl recipes —
  see api-reference.md). If you add subtle pure logic (like `predict.ts`), a small
  test file is welcome but keep the toolchain zero-config.
- No per-viewer sim controls (removed when the shared match landed — don't reintroduce).
