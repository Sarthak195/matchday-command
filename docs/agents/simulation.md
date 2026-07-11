# Simulation — engine, scenario, detection, shared live match

All under `src/lib/simulator/`. The simulation is the product's heartbeat: it must be
**deterministic** (same story every run) and **self-contained** (no network, no wall
clock, no unseeded randomness).

## `engine.ts` — SimulationEngine

Tick-based: each `tick()` advances one simulated minute and returns that minute's
events. Internals:

- **Seeded PRNG**: 32-bit LCG (`makeRng(seed)`, default seed 42). This is the ONLY
  allowed randomness in sim logic. Never use `Math.random()` here.
- **Scripted beats fire first** (`SCENARIO.filter(atMinute === now)`) and are folded
  into engine state via `applyScripted()`:
  - `match` → updates `phase` (except transient `goal`)
  - `gate-flow` → overwrites that gate's queue/entries (so the 28′ Gate C surge of
    420 then *decays naturally* through the normal queue model)
  - `crowd-density` → sets a zone override `{pct, until: now+12}` (12-minute hold,
    then baseline resumes)
- **Arrival model**: gaussian bump `exp(-x²)` with peak at `KICKOFF_MINUTE − 20 = 40′`
  and spread 22, scaled so ~`EXPECTED_ATTENDANCE` (46k) total arrive; zero after
  full time. Arrivals split across gates by throughput share with ±15% jitter; each
  gate processes `min(queue + inflow, throughputPerMinute)`; the remainder queues.
- **Telemetry cadence** (staggered so the feed breathes): gate-flow for all gates at
  `minute % 5 === 2`; crowd-density for all non-medical zones at `minute % 5 === 4`.
- **Occupancy model** (`zoneOccupancy`): gate plazas ≈ their gates' queues + noise;
  concourses share `concourseShare/2` of `inside` where share = 0.30 pre-kickoff,
  0.42 at halftime, 0.10 during play; seating gets the rest; ±8% jitter.
- Event ids: `evt-<seq>` (monotonic per engine instance).

**Tuning tips:** to make predictive warnings fire earlier/later, adjust the arrival
spread or `concourseShare`; to change how dramatic the Gate C beat is, edit the beat
in scenario.ts (the engine will decay from whatever you set).

## `scenario.ts` — the scripted story

`SCENARIO: ScenarioBeat[]` — `{atMinute, events: EventDraft[]}` where `EventDraft` is
`DistributiveOmit<StadiumEvent, "id"|"venueId">` (the distributive helper keeps the
discriminant intact — plain `Omit` over a union would collapse it).

Current beats: 0′ gates-open · 28′ Gate C surge + steward radio · 41′ North Concourse
89% · 60′ kickoff · 68′ medical Block 12 (serious) · 75′ storm + roof-ops radio ·
83′ goal + celebration radio · 105′ halftime · 120′ second half · 165′ fulltime +
egress radio.

**This file IS `docs/DEMO_SCRIPT.md` in data form — keep them in sync.** The beat
minutes also feed the ops header's "⏭ Next beat" button (`BEAT_MINUTES` in
dashboard.tsx imports SCENARIO directly — it's plain data, safe in the client bundle).

## `detector.ts` — IncidentDetector

Pure rules over each tick's events. **Dedupe keys** prevent one ongoing situation
from re-opening every telemetry cycle (`openKeys` set — note: incidents never
auto-close; resolution is operator action in the client):

| Rule | Trigger | Key | Severity |
|---|---|---|---|
| Crowd | `crowd-density ≥ 85%` | `crowd:<zoneId>` | ≥92% → high, else medium |
| Gate | `gate-flow queueLength ≥ 300` | `gate:<gateId>` | medium |
| Medical | any `medical` event | none (each is distinct) | hint: life-threatening → critical, serious → high, else medium |
| Weather | `weather condition === "storm"` | `weather:storm` | medium |
| Radio | never auto-opens | — | radio logs are triage *context*, not incidents |

Incident ids: `inc-<seq>`. Titles are human-readable and zone/gate-resolved.

**Adding a rule:** new `case` in `process()`, pick a dedupe key, keep severity
mapping explicit. If the rule needs cross-tick state (trends), prefer extending
`predict.ts` (client-side warnings) instead — the detector stays stateless-per-event
apart from dedupe.

## `live.ts` — THE shared match (read this before touching streaming)

GlobalThis singleton (`__mdcLiveMatch` — survives Next dev HMR). One engine + one
detector + one event log serve every SSE subscriber:

- `subscribe(send)` → **catch-up burst**: last 250 events (log caps at 500), all
  incidents, current clock — then adds the subscriber. Returns an unsubscribe fn.
- Ticks on a single `setInterval(tickMs)`; **pauses when subscriber count hits 0**
  (Cloud Run: SSE keeps the instance alive while anyone watches) and **hard-stops at
  minute 200**.
- `control()`: `speed` (clamp 250–10000ms, restart timer) · `jump` (synchronously
  `step()` to target ≤200 — every step broadcasts, so clients receive the burst as
  ordinary messages) · `restart` (fresh engine/detector/log, broadcast
  `{kind:"reset"}` then `{kind:"clock",0}`).
- Broadcast wraps each `send` in try/catch — a dead subscriber is dropped by its own
  abort handler.

Consequences you must respect:
1. Anything broadcast is seen by ALL views — per-viewer things (triage results,
   voice radio events, copilot-opened incidents, emergency posture) are **client
   state only**, injected via the reducer, and will vanish on reconnect/restart.
   That's accepted. Cross-view things go through the task queue or a new server API.
2. `--max-instances 1` on Cloud Run is load-bearing. A second instance would fork
   reality. If you ever need scale: move LiveMatch to a broker (Redis pub/sub or
   Firestore) — that's the documented escape hatch.
3. Don't reintroduce per-connection `?tickMs=`/`?startMinute=` params on
   `/api/stream` — they were removed deliberately when the shared match landed.

## `src/lib/predict.ts` — early warnings (client-side)

`computeWarnings(events, nowMinute)`: rebuilds per-zone density and per-gate queue
series (events arrive newest-first; it reverses), then for each series takes samples
within a 25′ window, needs ≥2 points, computes rate = (last−first)/Δt and warns when:
below threshold, rate ≥ 0.3 %/min (zones) or ≥ 8/min (queues), and ETA to threshold
∈ [1, 20] minutes. Already-breached targets are skipped (that's the detector's job).
Sorted by ETA. Runs in a `useMemo` per tick — keep it O(events).

## `src/lib/traffic/model.ts` — approach traffic (client-side, deterministic)

`trafficAt(minute, phase)`: load curve = gaussian arrival pressure peaking at
kickoff−15, quiet during play (0.15), egress surge after fulltime (0.95 decaying).
3 corridors (AB Road north / Ring Road east / Bypass south — paths are lat/lng
offsets from `VENUE_LOCATION`) with per-corridor share multipliers; ETA base by
congestion level {clear 6, moderate 11, heavy 19, severe 28} minutes. 3 lots fill
with load. Advisories: worst-vs-clearest corridor steer, near-full lot redirect,
egress notice. Same function drives the map overlays (both Google and schematic)
and the staff console's traffic panel — keep it pure.

## `src/lib/tournament.ts` — sister venues

`venueSummary(venue, sharedMinute)`: local clock = shared minute + per-venue offset
(staggered kickoffs: Lakeside +35, Garrison −20, River Bend −50). Deterministic
hash-noise (`noise(seed, bucket)`) wobbles a density S-curve with a halftime bump;
incident counts drift up through the day. Meridian's card does NOT use this — it
reports real shared-state numbers (see tournament-dashboard.tsx). Sister venues are
labeled "simulated" in the UI — keep that honest.
