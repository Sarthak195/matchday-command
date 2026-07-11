# Domain models — the shared vocabulary

Everything in `src/shared/models/`, re-exported through `index.ts`. These types are
imported by the simulator, every API route, and every view. **Change them first;
let the compiler find the consumers.** No file outside `src/shared/` may define a
domain concept.

## Clock semantics (used by every model)

`atMinute` / `createdAtMinute` / `generatedAtMinute` are **simulation minutes since
gates open** — never wall time. Fixed points: kickoff **60**, goal beat 83, halftime
**105**, second half **120**, full time **165**, hard stop 200. Rationale:
deterministic, fast-forwardable, no timezone/wall-clock flakiness.

## `venue.ts` — physical layout

- `Venue` → `DEMO_VENUE` in constants: id `meridian-arena`, 52,000 capacity, Indore.
- `Zone` (`ZoneKind`: gate | concourse | seating | concessions | medical | parking).
  Actual zones: `gate-plaza-north`, `gate-plaza-south` (6k each), `concourse-north`,
  `concourse-south` (9k each), `seating-bowl` (52k), `medical-bay` (60).
- `Gate`: `gate-a`/`gate-b` (north plaza, 220/min), `gate-c` (south, 220/min),
  `gate-d` (south, 180/min).
- Zone `capacity` is the denominator for density %: `densityPct = occupancy/capacity`.

## `events.ts` — the telemetry union

`StadiumEvent` is a **discriminated union on `type`** with base fields
`{id, atMinute, venueId}`:

| type | Payload | Emitted by |
|---|---|---|
| `gate-flow` | `gateId, entriesPerMinute, queueLength` | engine every 5′ per gate (minute % 5 === 2) + scripted beats |
| `crowd-density` | `zoneId, occupancy, densityPct` | engine every 5′ per non-medical zone (minute % 5 === 4) + beats |
| `radio-log` | `channel (security\|medical\|facilities\|stewarding), from, message` | scripted beats, voice input, emergency declaration |
| `medical` | `zoneId, description, severityHint? (minor\|serious\|life-threatening)` | scripted beats |
| `weather` | `condition (clear\|rain\|storm\|heat), tempC, note?` | scripted beats (NB: coarser than WeatherCondition in weather.ts — sim weather vs forecast weather are separate concepts) |
| `match` | `phase (MatchPhase), note?` | scripted beats only |

`MatchPhase`: `gates-open | kickoff | goal | halftime | second-half | fulltime`.
`goal` is transient — phase trackers keep the previous phase when they see it.

**Adding a signal type:** add the interface + union member here → emit it in
`engine.ts` or `scenario.ts` → handle it in `EventLine` (dashboard.tsx) and
`eventToText` (copilot context) → optionally add a `detector.ts` rule. The compiler's
exhaustiveness on `switch(e.type)` finds most of these sites.

## `incident.ts` — operator-facing work

- `IncidentSeverity`: `info | low | medium | high | critical`.
- `IncidentStatus` lifecycle: `open → acknowledged → resolving → resolved`
  (UI currently uses open/acknowledged/resolved; `resolving` is reserved).
- `IncidentCategory`: `crowd | medical | security | weather | facilities | other`.
- `Incident.sourceEventIds` links back to triggering events; locally created
  incidents (copilot, predictive warnings) use `[]`.
- `TriageResult` (AI-filled): `summary, severity, rationale, recommendedActions[],
  escalate`. `RecommendedAction`: `{action, assignTo: RadioChannel, priority 1|2|3}`.
  When triage lands, the client **overwrites incident.severity with the AI's** —
  intentional: the model sees more context than the threshold rule did.

Invariant: **rules/operators/copilot open incidents; Gemini only fills `triage`.**

## `briefing.ts` — AI documents

- `OpsBriefing`: `headline, situation (markdown-ish), watchItems[], crowdOutlook,
  openIncidentIds[]`. Server fills id `brf-<minute>` + openIncidentIds from request.
- `HandoverReport`: `shift, narrative, actionsForNextShift[], resolved/openIncidentIds`.
  Gemini only generates the prose fields; ids are computed server-side from the
  posted incident list (keeps the model from hallucinating ids).

## `stream.ts` — the wire protocol

Every SSE `data:` line is one JSON `StreamMessage`:
`{kind:"clock", minute}` · `{kind:"event", event}` · `{kind:"incident", incident}` ·
`{kind:"snapshot", state}` (reserved, unused) · `{kind:"reset"}` (shared match
restarted — clients must drop accumulated state).

Client contract (implemented in `useMatchStream`): dedupe events and incidents by
id (catch-up bursts replay history), reset on `{kind:"reset"}` AND on every
EventSource `onopen` (auto-reconnect replays the burst cleanly).

## `weather.ts` — forecast (distinct from sim weather events)

`WeatherForecast`: `source: "live"|"simulated"`, current readings
(`tempC, feelsLikeC, condition, precipProbPct, windKph, humidityPct`), `summary`
(one ops-facing line), `horizon: WeatherHorizon[]` (+1h/+2h/+3h).
`WeatherCondition` here is finer than the event enum: adds `clouds`, `cold`.
UI must always show the `source` badge ("● Live (Open-Meteo)" / "● Simulated fallback").

## `demand.ts` — supply forecasting

- `SupplyItem`: 11 items (umbrella, poncho, bottled-water, cold-drink, hot-beverage,
  hot-food, cold-food, handheld-fan, blanket, ice, energy-drink). The Gemini schema
  enum-locks to this list — extend the type AND the route's `SUPPLY_ITEMS`.
- `DemandLine`: `predictedUnits, currentStock, gap (computed server-side as
  predicted - stock), driver, urgency (now | before-kickoff | by-halftime | monitor)`.
- `DemandPlan`: id `dmd-<minute>`, `weatherBasis`, `summary`, `lines[]`.

## `staff.ts` — the tasking layer

- `StaffRole`: catering, concessions, stewarding, security, medical, facilities,
  traffic, logistics (8 roles — enum-locked in Gemini schemas too).
- `TaskStatus` flow: `pending → acked → in-progress → done` (client-side overrides
  map keyed by task id; ids must be stable across re-derivation).
- `TaskOrigin`: `incident | demand | weather | traffic | match | copilot | emergency`
  — drives the left-stripe color on task cards (see frontend.md). Adding an origin:
  update this union + `ORIGINS` in `api/tasks/route.ts` + `ORIGIN_COLOR` in
  `staff-dashboard.tsx`.
- `StaffTask`: `{id, createdAtMinute, role, title, detail, priority 1|2|3, origin,
  status, dueBy?}`. Server-assigned ids look like `task-srv-N`; derived ids like
  `task-inc-<incidentId>`, `task-wx-wet`, `task-dmd-<minute>-<i>`.

## `traffic.ts` — approach state

`CongestionLevel`: `clear | moderate | heavy | severe`. `Corridor` (name, congestion,
`etaMin`, `path: LatLng[]`), `ParkingLot` (capacity, occupancy, location),
`TrafficAdvisory` (`severity: info|warning`), bundled as `TrafficState`. Produced
client-side by `trafficAt(minute, phase)` — see simulation.md.

## `emergency.ts` — evacuation

`EvacZoneOrder`: `{zoneId, zoneName (server-resolved), instruction, exitVia,
priority 1|2|3}` — 1 moves first, 3 holds/last. `EvacuationPlan`: id `evac-<minute>`,
`paAnnouncement` (calm, read-verbatim PA text), `commandSummary`, `zoneOrders[]`.
Staff work orders are NOT in the plan object — the route dispatches them into the
task store directly (origin `emergency`, title prefixed `[EVAC]`).

## Constants that pair with these models (`src/shared/constants.ts`)

| Constant | Value | Used by |
|---|---|---|
| `DENSITY_WATCH_PCT` | 70 | zone meter "Watch" state |
| `DENSITY_ALERT_PCT` | 85 | detector opens crowd incident; predict target |
| `DENSITY_CRITICAL_PCT` | 92 | detector rates high severity; meter "Critical" |
| `QUEUE_ALERT_LENGTH` | 300 | detector gate rule; predict target; gate tile states |
| `SIM_TICK_MS` | 2000 | live match default pace (500 at 4×) |
| `KICKOFF_MINUTE` | 60 | arrival curve peak = kickoff − 20 |
| `EXPECTED_ATTENDANCE` | 46,000 | arrival curve total; demand prompts |
| `VENUE_LOCATION` | 22.7243, 75.8712 (Indore) | map center, weather query, traffic fixtures |
