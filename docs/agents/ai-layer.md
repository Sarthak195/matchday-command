# AI layer — Gemini integration

Five Gemini-backed endpoints, one wrapper. Everything here is designed around three
constraints: **free-tier quota** (~250 requests/day — the key comes from a no-billing
GCP project; see infrastructure.md), **groundedness** (the model may only use
supplied state), and **structured output** (no regex-scraping model text, ever).

## `src/lib/gemini.ts` — the wrapper

- `getClient()`: lazy singleton `GoogleGenAI({apiKey: GEMINI_API_KEY})`. Throws a
  descriptive error if the key is missing — routes surface it as JSON `{error}`.
- `getModel()`: `GEMINI_MODEL` env or default **`gemini-3.5-flash`**.
  ⚠ History: `gemini-2.5-flash` is retired for new API keys (mid-2026) — if you see
  404 "no longer available to new users", the model id is stale. List what a key can
  use: `GET https://generativelanguage.googleapis.com/v1beta/models?key=...`.
- `generateJson<T>({system, prompt, schema})`: `responseMimeType: application/json`
  + `responseSchema` (built with the `Type` enum from `@google/genai`). Returns
  parsed `T`. All structured-output calls go through this.
- `geminiErrorMessage(err)`: translates SDK errors (often raw JSON blobs) into
  UI-friendly lines — 503 → "Gemini is briefly overloaded — try again in a few
  seconds", 429 → rate-limit text. **Every route's catch block uses this.**

## Prompting rules (enforced in every system prompt — keep them)

1. **Grounding**: "Use ONLY the supplied telemetry/state. Never invent facts." The
   footer of the app promises this to judges.
2. **Specificity**: name gates, zones, roles, channels. Generic advice reads as
   filler.
3. **Ops tone**: terse, decision-oriented, word-capped where it matters (~120 words
   for copilot answers).
4. **Enum-locking**: anywhere the model outputs a role/category/severity/item, the
   schema uses `enum` — server code then never validates strings by hand. If you
   extend a domain enum, update the matching schema enum in the route.
5. **Server computes, model writes**: ids, gaps (`predicted − stock`), zone names,
   incident-id lists are computed server-side; the model only generates judgment and
   prose. This kills a whole class of hallucination bugs.

## Endpoint-by-endpoint

### `POST /api/triage` → `TriageResult`
Input: `{title, category, zoneId?, contextEvents: StadiumEvent[]}`. The client
selects context via `triageContext()` in dashboard.tsx (events in the incident's
zone, its gate's zone, radio logs within ±10′, its source events; cap 15,
chronological). Schema enum-locks severity and `assignTo` (radio channels).
System prompt: duty-manager's copilot; "smallest set of actions that keeps people
safe". On success the client overwrites the incident's severity with the AI's.

### `POST /api/briefing` (and `?type=handover`) → `OpsBriefing` / `HandoverReport`
Input: `{minute, incidents (full list), recentEvents (last ~40, chronological),
shiftLabel?}`. Gemini generates prose fields only; the server assembles the full
object (ids, open/resolved incident id lists). Two schemas, one shared
`contextBlock()`.

### `POST /api/demand` → `{plan: DemandPlan, tasks: StaffTask[]}`
Input: `{minute, phase, attendance, weather: WeatherForecast, currentStock?}`.
`DEFAULT_STOCK` (route-local) supplies opening inventory so the model computes
against real numbers; server computes `gap`. Also returns role-assigned prep tasks
(origin `demand`) — these are NOT auto-dispatched to the server queue; the staff
console merges them locally (contrast with /api/emergency, which does dispatch).
Domain rules live in the system prompt (heat → cold drinks/ice/fans; rain → ponchos
+ shift cold→hot food; cold → hot beverages/blankets; scale with attendance).

### `POST /api/copilot` → `{text: string|null, toolCalls: [{name, args}]}`
The agentic surface. Input: `{messages: last ≤12 {role: user|assistant, text},
snapshot}` (snapshot built client-side at send time: zones+density, gates, top 12
incidents incl. triage summaries, early-warning strings, traffic advisories, weather
summary, last 20 events as compact text lines — see `copilotSnapshot()` /
`eventToText()` in dashboard.tsx).

- Snapshot is inlined into the **system prompt** (stateless route, fresh each call).
- `config.tools = [{functionDeclarations: TOOL_DECLARATIONS}]` — typed as
  `FunctionDeclaration[]` (plain object literals fail TS inference on the union).
- Three tools: `open_incident{title, category, severity, zoneId?}`,
  `dispatch_task{role, title, detail, priority, dueBy?}`, `generate_briefing{}`.
- **Single-round design**: tool calls are returned to the client, which executes
  them in `runToolCall()` (dashboard.tsx) and echoes a "✓ …" confirmation line into
  the chat. There is NO functionResponse loop back to the model — predictable,
  quota-cheap, good enough for ops commands. If you add multi-step tool use,
  budget quota carefully.
- **The act-vs-answer boundary is prompt-enforced and was tuned after a real
  failure**: the first prompt made "What needs my attention?" dispatch a task. The
  current rule: call a function ONLY on an explicit instruction; questions get text
  (optionally ending with an offered action). If you touch this prompt, re-run both
  test cases (see api-reference.md).

Adding a copilot tool: (1) add the `FunctionDeclaration` (enum-lock args), (2) add a
`case` in `runToolCall()` returning a confirmation string, (3) mention the
capability in the system prompt's action list, (4) test one command that should
trigger it and one question that should NOT.

### `POST /api/emergency` → `{plan: EvacuationPlan, tasks: StaffTask[]}`
Input: `{minute, reason, zones: [{id,name,densityPct,occupancy}], incidents}`.
Schema enum-locks `zoneId` to the venue's actual zone ids and roles to `StaffRole`.
System prompt demands: calm PA text (no panic words), sequencing by density/exposure,
medical bay holds in place, routes that avoid crossing flows. **Side effect**: the
route calls `addTask()` directly — `[EVAC]`-prefixed work orders (origin `emergency`,
dueBy "immediately") land in the shared queue, so the staff console needs no extra
wiring. Zone names resolved server-side.

## Quota & failure playbook

- Free tier ≈ 250 req/day, ~10 RPM. All calls are user-triggered; **never add a
  Gemini call on a timer/interval**. The auto demand-plan on staff-console mount is
  the one automatic call (once per page load) — keep it that way.
- 503 UNAVAILABLE happens under load — the UI copy tells users to retry; transient.
- 429 with "prepayment credits" text means someone swapped the key for one from a
  billing-enabled project — in India the paid tier is prepaid-only. Fix: use the key
  from the no-billing project (`matchday-gemini-2624`), not the app project.
- Test prompts cheaply: temperature isn't set anywhere (defaults) — outputs vary
  slightly between runs; assert on structure, not exact wording.
