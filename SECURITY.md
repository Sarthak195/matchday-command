# Security

MatchDay Command is a demonstration app for the Google PromptWars competition. All match-day data is **simulated** — there is no real user data, no authentication, and no personal information by design. Still, the app follows sensible web-security practice.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository, or email the maintainer. Please do not file public issues for security reports.

## Measures in place

- **Security headers** (`next.config.ts`): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and a production `Content-Security-Policy`.
- **Input validation**: every API route validates its request body and returns a `400` on malformed input rather than throwing; free-text fields are length-bounded.
- **Rate limiting** (`src/lib/rate-limit.ts`): the AI and mutating routes are rate-limited per client to prevent a single caller from exhausting Gemini quota or disrupting the shared demo (`429` with `Retry-After`).
- **Constrained AI actions**: the copilot can only invoke a fixed allowlist of tools (open incident, dispatch task, generate briefing), executed client-side through an exhaustive `switch` — the model cannot induce arbitrary actions.
- **Secret handling**: `GEMINI_API_KEY` is read server-side only and never sent to the client. The Google Maps browser key is delivered at runtime and must be HTTP-referrer + API restricted.
- **No injection sinks**: no `dangerouslySetInnerHTML`, `eval`, or `new Function`; React escapes all rendered content. The only outbound `fetch` targets fixed, non-user-controlled hosts (Gemini, Open-Meteo).

## Scope notes

- The app is deployed as a **single Cloud Run instance** (`--max-instances 1`); match-day state and rate-limit windows are in-memory and reset on restart, which is intentional for the demo.
- Simulation controls (`/api/sim`) are intentionally global and unauthenticated — the demo is a shared control room, not a per-viewer session.
