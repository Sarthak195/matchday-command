# Frontend — views, state, design system

Three views over one shared match, all client components under `src/components/`,
mounted by thin server pages in `src/app/`.

| Route | Component | Persona |
|---|---|---|
| `/` | `dashboard.tsx` | Ops control room (duty manager) |
| `/staff` | `staff-dashboard.tsx` | Floor teams (task board) |
| `/tournament` | `tournament-dashboard.tsx` | Tournament supervisor |

## Client state — `src/lib/useMatchStream.ts`

The one hook every view calls. Opens `EventSource("/api/stream")`, reduces
`StreamMessage`s into `DashState {minute, phase, events (cap 250, newest first),
incidents, zones{id→occupancy,densityPct}, gates{id→entries,queue}}`.

Contracts baked into the reducer — do not weaken them:
- **Dedupe by id** for both events and incidents (the server's catch-up burst
  replays history on reconnect).
- **Reset on `{kind:"reset"}`** (global restart) **and on `onopen`** (EventSource
  auto-reconnects; resetting before the burst prevents interleaved stale state).
- `goal` match events do not change `phase`.

Local-only injections reuse the same reducer (`dispatch({type:"message", ...})`):
voice radio events (`evt-voice-N`), copilot/warning-created incidents
(`inc-local-N`, `inc-cp-*`), the emergency declaration radio log. These are
per-viewer by design and vanish on reconnect — see simulation.md consequence #1.

Other client-state rules:
- Triage results and incident status changes are reducer actions (`triage`,
  `status`) — per-viewer.
- Staff task statuses use an `overrides: Record<taskId, TaskStatus>` map so derived
  tasks (recomputed every tick) keep stable statuses — **derived task ids must be
  stable** (e.g. `task-wx-wet`, `task-inc-<id>`, traffic ids strip the minute
  suffix).
- The staff console polls `GET /api/tasks` every 15s and merges server-dispatched
  tasks into the derived list.

## Design tokens — `src/lib/theme.ts` (read before changing ANY color)

Dark-only UI. Tokens come from a CVD- and contrast-validated palette:

- Surfaces: page `#0d0d0d`, panel `#1a1a19`, hairline `border-white/10`.
- Ink: primary `#ffffff`, secondary `#c3c2b7`, muted `#898781`.
- **Status** (validated ≥3:1 on the dark surface): good `#0ca30c`, warning
  `#fab219`, serious `#ec835a`, critical `#d03b3b`.
- Accent (interactive/brand): `#3987e5`; solid buttons use `#1c5cab` (hover
  `#256abf`) because white text clears 4.5:1 there.
- Copilot-origin violet: `#9085e9`.

Non-negotiable rules inherited from the design system:
1. **Color never carries meaning alone** — every status color ships with a text
   label ("● High", "Watch", "EGRESS"). Screenshot-test any change against this.
2. **Text never wears the data color** — values/labels stay in ink tokens; the
   colored mark (dot, stripe, meter fill) sits beside them. (Exception: large
   single-word states like EGRESS where the word IS the label.)
3. **Meters**: fill = status color, track = same color at ~20% (`${color}33`).
4. Status hues are reserved for state — never use them as decorative series colors.

Helpers: `densityState(pct)` → {label, color} at 70/85/92 thresholds;
`SEVERITY_META`, `PHASE_LABEL`, `CONGESTION_COLOR`.

## Shared primitives — `src/components/primitives.tsx`

`Panel {title, action?, className?, bodyClassName?}` (bordered section with
uppercase header; `action` slot hosts things like the voice button) · `Tag`
(muted uppercase chip) · `StatRow` (label/value line). Use these before inventing
new shells.

## Component notes

- **`dashboard.tsx`** (ops) — the largest file. Contains: global sim controls
  (POST `/api/sim`), early-warnings panel (from `predict.ts`), zone meters, gate
  tiles (EGRESS mode when emergency active), weather panel, map panel + advisories,
  live feed (voice button in Panel action), incident queue (AI triage per card),
  briefing/handover/export, emergency flow (confirm → banner → plan overlay),
  `copilotSnapshot()` + `runToolCall()` for the copilot. Mobile order:
  zones(1) → incidents(2) → map+feed(3) via `order-*` classes on the grid children.
- **`copilot.tsx`** — floating chat drawer (z-40, below overlays at z-50). Props:
  `snapshot: () => unknown` (called at send time) and
  `onToolCall: (call) => Promise<string>` (returns the confirmation line).
  Suggestion chips seed first-time use. Confirmation messages get a green border
  (`kind:"action"`), errors a serious border.
- **`venue-map.tsx`** — runtime-fetches `/api/config`; if a Maps key exists, loads
  the Maps JS API (script injection with a module-level promise so it loads once),
  dark-styled map + `TrafficLayer` + corridor polylines + lot circles; else renders
  `SchematicMap` (SVG projection of the same lat/lng fixtures). Google objects are
  intentionally `any` — do NOT add `@types/google.maps`; the fallback must compile
  without Google types.
- **`voice-radio.tsx`** — Web Speech API (`webkitSpeechRecognition` fallback),
  `lang: en-IN`, single-shot. Renders "mic n/a" when unsupported (Firefox/Safari).
  Emits transcript via `onTranscript` — the dashboard turns it into a radio-log
  event.
- **`staff-dashboard.tsx`** — derives tasks from: open incidents (role by
  category), traffic advisories, weather readiness rules (wet/hot/cold), the AI
  demand plan (auto-fetched once when weather arrives — guarded by a ref), and the
  server queue. Groups by role, sorts by priority, status flow
  pending→acked→in-progress→done.
- **`tournament-dashboard.tsx`** — Meridian card computes real numbers from shared
  state; sister cards call `venueSummary()`. Live card links to `/`.

## Styling conventions

Tailwind v4 (no config file; `@import "tailwindcss"` in `globals.css`). Arbitrary
values for token colors (`bg-[#1a1a19]`, `text-[#898781]`) — consistent with the
token set; don't mix in Tailwind's own color scale. `tabular-nums` for number
columns only. Layout: max-width 1400px shells, `lg:` breakpoint for the 3-column
grids, capped panel heights with `overflow-y-auto`.

## Adding a panel to a view (recipe)

1. Compute the data client-side (a `useMemo` over `state`) or add an API (see
   api-reference.md).
2. Wrap in `<Panel title="...">`; use status colors ONLY via `theme.ts` helpers
   with labels.
3. Mobile: decide its `order-*` slot.
4. If the copilot should know about it, add it to `copilotSnapshot()` — and keep
   the snapshot small (strings/numbers, top-N caps).
