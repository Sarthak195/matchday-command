# API reference

All routes under `src/app/api/*/route.ts`, all `force-dynamic`. Base URLs:
local `http://localhost:3000`, prod
`https://matchday-command-1069049902747.asia-south1.run.app`.

Conventions: JSON in/out; errors are `{error: string}` with 400 (bad input) or 500
(upstream/AI failure — message already humanized by `geminiErrorMessage`); AI routes
are stateless (client posts its accumulated state). PowerShell examples use
`curl.exe` + here-strings (see conventions-and-gotchas.md for quoting traps).

---

## `GET /api/stream` — the live feed (SSE)

Subscribes this connection to THE shared match. No query params (removed when the
shared match landed — do not reintroduce). Each `data:` line is one `StreamMessage`
(see domain-models.md § stream). New subscribers first receive a catch-up burst
(≤250 events + all incidents + clock), then live messages.

```powershell
curl.exe -s --max-time 6 "$base/api/stream"   # exit code 28 (timeout) is EXPECTED
```

## `POST /api/sim` — global sim controls

Body is one of:
```json
{"type":"speed","tickMs":500}     // clamped 250–10000
{"type":"jump","toMinute":75}     // fast-forwards shared match (≤200), broadcasts burst
{"type":"restart"}                // fresh match; broadcasts {"kind":"reset"}
```
Returns `{ok:true, minute}`. Affects EVERY connected view — that's the point.

## `GET /api/config` — client bootstrap

`{mapsEnabled: boolean, mapsApiKey: string|null}`. The Maps browser key is delivered
at runtime (never build-inlined) so it can be rotated with `gcloud run services
update` and so keyless deployments degrade to the schematic map.

## `GET /api/weather` — venue forecast

`WeatherForecast` — live from Open-Meteo (server-cached ~5 min via
`next.revalidate: 300`) or the simulated monsoon fallback (`source` says which).
Never fails: network errors → fallback.

## `POST /api/triage` — AI incident triage

```json
{"title":"Gate C queue at 420","category":"crowd","zoneId":"gate-plaza-south",
 "contextEvents":[ /* StadiumEvent[], chronological, ≤15 */ ]}
```
→ `TriageResult {summary, severity, rationale, recommendedActions[{action,assignTo,priority}], escalate}`.

```powershell
$body = @'
{"title":"Test","category":"crowd","contextEvents":[{"id":"e1","atMinute":10,"venueId":"meridian-arena","type":"gate-flow","gateId":"gate-a","entriesPerMinute":50,"queueLength":350}]}
'@
curl.exe -s -X POST -H "Content-Type: application/json" -d $body "$base/api/triage"
```

## `POST /api/briefing` — ops briefing / shift handover

Body: `{minute, incidents: Incident[], recentEvents: StadiumEvent[], shiftLabel?}`.
- Default → `OpsBriefing {id, generatedAtMinute, headline, situation, watchItems[], crowdOutlook, openIncidentIds[]}`
- `?type=handover` → `HandoverReport {id, shift, generatedAtMinute, narrative, actionsForNextShift[], resolvedIncidentIds[], openIncidentIds[]}`

## `POST /api/demand` — weather-driven supply forecast

Body: `{minute, phase, attendance, weather: WeatherForecast, currentStock?}`.
→ `{plan: DemandPlan, tasks: StaffTask[]}` (origin `demand`; NOT auto-queued —
the staff console merges them client-side).

## `POST /api/copilot` — agentic chat

```json
{"messages":[{"role":"user","text":"..."}],   // ≤12 kept; last MUST be user
 "snapshot":{ /* see copilotSnapshot() in dashboard.tsx */ }}
```
→ `{text: string|null, toolCalls: [{name, args}]}` — the client executes tool calls
(`open_incident` | `dispatch_task` | `generate_briefing`). Behavioral contract to
re-verify after ANY prompt/tool change:

```powershell
# 1) QUESTION → expect text, toolCalls: []
$q = @'
{"messages":[{"role":"user","text":"What needs my attention right now?"}],"snapshot":{"minute":42,"phase":"gates-open","weather":"clouds, 30C","zones":[{"id":"concourse-north","name":"North Concourse","densityPct":89}],"gates":[],"incidents":[{"id":"inc-0","title":"Gate C queue at 420","severity":"medium","status":"open"}],"earlyWarnings":[],"trafficAdvisories":[],"recentEvents":[]}}
'@
curl.exe -s -X POST -H "Content-Type: application/json" -d $q "$base/api/copilot"

# 2) COMMAND → expect toolCalls: [{name:"dispatch_task", args:{role:"catering",priority:1,...}}]
$cmd = @'
{"messages":[{"role":"user","text":"Tell catering to start hot food prep for halftime, priority 1"}],"snapshot":{"minute":88,"phase":"kickoff","weather":"clouds, 30C","zones":[],"gates":[],"incidents":[],"earlyWarnings":[],"trafficAdvisories":[],"recentEvents":[]}}
'@
curl.exe -s -X POST -H "Content-Type: application/json" -d $cmd "$base/api/copilot"
```

## `GET | POST /api/tasks` — the dispatch queue

- `GET` → `{tasks: StaffTask[]}` (staff console polls every 15s).
- `POST` body: `{role, title, detail, priority, dueBy?, origin?, createdAtMinute?}`
  → `{task}` with server id `task-srv-N`, default status `pending`, priority clamped
  1–3, origin validated against the `TaskOrigin` union (defaults to `copilot`).
  400 if role/title/detail missing. In-memory, cap 200, cleared on instance restart.

## `POST /api/emergency` — evacuation planning (side-effecting!)

Body: `{minute, reason, zones:[{id,name,densityPct,occupancy}], incidents}`.
→ `{plan: EvacuationPlan, tasks: StaffTask[]}` AND (side effect) the tasks are
already `addTask()`-ed into the queue (origin `emergency`, titles `[EVAC] …`,
dueBy "immediately") — callers must NOT re-post them to /api/tasks.

---

## End-to-end verification recipes

**Shared clock (the invariant that must never regress):**
```powershell
curl.exe -s -X POST -H "Content-Type: application/json" -d '{"type":"jump","toMinute":40}' "$base/api/sim"
$a = curl.exe -s --max-time 4 "$base/api/stream" | Select-String '"kind":"clock"' | Select-Object -Last 1
$b = curl.exe -s --max-time 4 "$base/api/stream" | Select-String '"kind":"clock"' | Select-Object -Last 1
# $a and $b must be within a few minutes of each other (same match), NOT one of them 0/1.
```

**Incident pipeline:** jump to 80, sample the stream, expect 4 incidents by then
(Gate C 29′, North Concourse 42′, medical 69′, storm 76′).

**Ops→staff loop:** POST a task, GET /api/tasks, confirm it round-trips.

**Pages render:** `curl.exe -s $base/ | Select-String "Zone density"`, same for
`/staff` ("Task board") and `/tournament` ("Tournament pulse"). Beware HTML entity
escaping — check for `Approach` not `Approach & traffic`.
