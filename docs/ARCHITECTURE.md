# Architecture

## The one-sentence design

A scripted match-day **simulator** emits typed events over **SSE**; detection rules cluster them into **incidents**; **Gemini** (structured output) triages incidents and writes briefings; a single **Next.js** app hosts all of it, deployed on **Cloud Run**.

## Data flow

```
SimulationEngine.tick()  ──every SIM_TICK_MS──▶  StadiumEvent[]
        │                                             │
        ▼                                             ▼
  OpsState (in-memory)                     SSE /api/stream ──▶ dashboard
        │                                             │
        │        detection rules (planned):           │ operator clicks "Triage"
        │        density ≥ 85% → crowd incident       ▼
        │        queue ≥ 300  → gate incident   POST /api/triage
        │        medical event → medical incident     │
        ▼                                             ▼
   POST /api/briefing ─────────────▶ Gemini ◀─────────┘
   (OpsBriefing / HandoverReport)    structured JSON output
```

## Layers

### 1. Shared models — `src/shared/models/`

The contract everything else obeys. Key decisions:

- **`StadiumEvent` is a discriminated union** (`type` field): gate-flow, crowd-density, radio-log, medical, weather, match. Adding a signal source = add a member, and the compiler finds every switch that must handle it.
- **Events vs. incidents**: events are cheap raw signals; an `Incident` is an operator-facing object with lifecycle (`open → acknowledged → resolving → resolved`). Gemini never invents incidents — rules (or the operator) open them; Gemini fills the `triage` field.
- **`StreamMessage`** defines the SSE wire protocol so client and server can't drift.
- **Simulation clock** is `atMinute` — minutes since gates open, kickoff at 60. Deterministic, fast-forwardable, no wall-clock flakiness in demos.

### 2. Simulator — `src/lib/simulator/`

`scenario.ts` is a scripted storyline of `ScenarioBeat`s (the demo script in data form: Gate C queue surge at 28', concourse density spike at 41', medical at 68', storm at 75'). `engine.ts` stamps drafts with ids/venue and will layer baseline noise (arrival curves per gate, ambient density) so scripted anomalies stand out. Simulated data is a **feature**: the judging demo cannot be broken by missing hardware, rate limits, or dead APIs.

### 3. AI layer — `src/lib/gemini.ts` + API routes

One wrapper, `generateJson<T>()`, does all Gemini calls with `responseMimeType: application/json` + `responseSchema`, so responses parse into shared types with no regex scraping. Three AI features, same pattern:

| Feature | Route | Input | Output type |
|---|---|---|---|
| Incident triage | `POST /api/triage` (done) | incident + source events | `TriageResult` |
| Ops briefing | `POST /api/briefing` (stub) | current `OpsState` | `OpsBriefing` |
| Shift handover | `POST /api/briefing?type=handover` (stub) | shift window slice of state | `HandoverReport` |

Prompting rules baked into system instructions: use only supplied telemetry, name specific gates/zones/channels, smallest action set that keeps people safe.

### 4. State — `src/lib/store.ts`

In-memory singleton, intentionally. Cloud Run with `--max-instances 1` makes this safe for a demo, and a stateless restart just resets the simulation. Firestore is the documented escape hatch if persistence is ever needed — not before.

### 5. UI — `src/app/`

App Router, Tailwind v4, dark control-room theme. Planned dashboard layout: zone/gate status board (density heat states from `DENSITY_WATCH_PCT`/`DENSITY_ALERT_PCT`), live event ticker, incident queue with one-click triage, briefing panel. The landing page currently shows build status.

## Deployment

Single Dockerfile (Next standalone output) → Cloud Run, region `asia-south1`. `GEMINI_API_KEY` via `--set-env-vars` (or Secret Manager later). The app must degrade gracefully without the key: stream and dashboard work, AI buttons surface the error.

## Risks / known trade-offs

- **In-memory state**: multiple Cloud Run instances would fork reality. Mitigated by `--max-instances 1`; acceptable for a competition demo.
- **SSE on serverless**: long-lived connections are fine on Cloud Run (60-min request timeout) but the client should auto-reconnect (`EventSource` does by default).
- **LLM latency**: triage is user-triggered and async in the UI, so a 2–4s Gemini round-trip reads as "the copilot is thinking", not lag.
