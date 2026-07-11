# Conventions & gotchas

Read this before your first edit. Most items here were learned the hard way in this
repo — each gotcha lists the symptom you'll see if you trip it.

## Code conventions

- **TypeScript strict, no `any`** — with exactly two sanctioned exceptions, both
  locally eslint-disabled: Google Maps objects in `venue-map.tsx` (no
  `@types/google.maps` — the fallback must compile without Google types) and the Web
  Speech API in `voice-radio.tsx` (no lib types exist).
- **Types live in `src/shared/models/`** and are imported with
  `import type { … } from "@/shared/models"` (the barrel). Enums that Gemini
  outputs are duplicated as schema `enum` arrays in the route — keep them in sync.
- Comments state constraints the code can't (“single-instance by design”,
  “clock = minutes since gates open”), not narration of the next line.
- Naming: ids are prefixed monotonic (`evt-N`, `inc-N`, `task-srv-N`, `brf-<min>`,
  `evac-<min>`); derived client ids must be **stable across re-derivation**
  (`task-wx-wet`, `task-inc-<id>`) because status overrides key on them.
- File placement: pure logic → `src/lib/`, UI → `src/components/`, thin pages →
  `src/app/`, HTTP shape → route files. `page.tsx` files stay 5-liners.
- No new dependencies without strong cause — the app deliberately has 4 runtime
  deps (`next`, `react`, `react-dom`, `@google/genai`). Charts/maps/speech are all
  hand-rolled or browser-native.

## Determinism rules (the demo depends on these)

- Randomness ONLY via the seeded LCG in `engine.ts` / hash-noise in
  `tournament.ts`. `Math.random()` in sim/analytics code is a bug.
- No wall-clock (`Date.now`, `new Date`) in sim logic; the sim clock is `atMinute`.
  (UI-side `Date` for display-only purposes would be fine but currently none exists.)
- `SCENARIO` beats ↔ `docs/DEMO_SCRIPT.md` must stay in sync — the scenario IS the
  demo script.

## Verification workflow (there are no unit tests — this replaces them)

1. `npm run typecheck` after any model change (the compiler is the test suite for
   the discriminated unions).
2. `npm run build` — also catches route-level type issues.
3. Exercise what you changed with the curl recipes in api-reference.md (run
   `npm start` for prod-mode locally; `npm run dev` for iteration).
4. AI-behavior changes: re-run the copilot question/command pair; for other
   endpoints assert on JSON **structure**, not exact wording (temperature is
   default; wording varies).
5. After deploy: shared-clock check + one AI endpoint + pages-render check in prod.

## Gotchas (symptom → cause → fix)

### PowerShell (the dev machine is Windows 11)
- **`Cannot overwrite variable HOME`** → you wrote `$home = …`; `$HOME` is a
  read-only automatic variable. Use another name (`$page`).
- **JSON in commands**: use single-quoted here-strings (`@'…'@`, closing `'@` at
  column 0) — inline quoting mangles quotes. Multiline git commit messages: same.
- **`curl` is aliased** — always call **`curl.exe`**.
- **Piping a server command truncates it**: `npm start | Select-Object -First 6`
  KILLS the server when the pipe closes. Background long-running servers with
  `| Out-Null`, kill with `Get-Process node | Stop-Process` (note: kills ALL node).
- **Exit code 28** from a `curl.exe --max-time N` stream sample is expected
  (timeout), not a failure.

### HTML/verification
- `curl`-checking rendered pages for strings containing `&` fails — Next escapes to
  `&amp;`. Grep for a substring without the ampersand ("Approach", not
  "Approach & traffic").

### Next.js / React
- **Strict-mode double effect** in dev: `useMatchStream` opens/closes an extra SSE
  connection — harmless because reconnect resets + dedupes. Any new effect with
  external resources must be cleanup-safe the same way.
- **EventSource auto-reconnects** silently. Any state derived from the stream must
  tolerate a full history replay (dedupe by id) — this is a reducer contract, not
  an accident.
- `next-env.d.ts` is generated (build adds a routes.d.ts reference) — commit
  whatever the build produces; never hand-edit.
- Server/client boundary: `scenario.ts`, `constants.ts`, `theme.ts`,
  `tournament.ts`, `predict.ts`, `traffic/model.ts` are safe in client bundles
  (plain data/pure fns). `gemini.ts`, `store.ts`, `simulator/live.ts` are
  server-only — importing them into a client component leaks nothing secret but
  breaks the build (`GoogleGenAI` etc.).

### Gemini
- `Type` enum from `@google/genai` for ALL response schemas; a literal tool-
  declaration array needs an explicit `FunctionDeclaration[]` annotation (TS union
  inference otherwise produces `undefined`-typed optional props that fail).
- `res.text` is `undefined` when the model returns only function calls — always
  null-check.
- 404 "model … no longer available to new users" → stale model id; 429
  "prepayment credits" → wrong key project (see infrastructure.md).
- Copilot over-acting on questions is a known failure mode — the system prompt's
  act-vs-answer rule guards it; re-verify both test cases after prompt edits.

### GCP
- `--set-env-vars` wipes unlisted vars — **always `--update-env-vars`**.
- Fresh projects/APIs: IAM can lag 1–2 minutes; retry before diagnosing.
- The gcloud config can carry a poisoned `billing/quota_project` — if every
  command fails with SERVICE_DISABLED for a project you're not using, unset it.

### Design
- Never encode state as color alone; never reuse status colors decoratively; solid
  buttons use `#1c5cab` (not the lighter accent) for text contrast. See frontend.md.

## What NOT to do (explicit non-goals)

- Don't add per-viewer sim controls or per-connection sim params back.
- Don't add a database, auth, or queue infra without being asked — in-memory +
  `--max-instances 1` is a documented, deliberate trade-off.
- Don't add Gemini calls on timers/intervals (free-tier quota).
- Don't build fan-chatbot features — see product-context.md for the positioning.
- Don't claim capabilities the system doesn't have (traffic *signal* control,
  real sensor feeds) in code, copy, or docs — honest framing is part of the pitch.
