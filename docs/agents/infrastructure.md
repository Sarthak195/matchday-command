# Infrastructure — GCP, deploys, keys, CI

## The account & project map

Everything runs under the Google account **sjgotnfts1@gmail.com** (the machine's
gcloud login). GitHub: **Sarthak195/matchday-command** (public).

| Project | Purpose | Billing |
|---|---|---|
| `matchday-command-2624` | Cloud Run service + **Maps API key** | ✅ linked ("My Billing Account", `010F0C-703526-FA0243`) |
| `matchday-gemini-2624` | **Gemini API key only** | ❌ deliberately NO billing → free tier |
| `project-7ee69f02-c0cf-4f51-952` | abandoned (broken default SA, was the stale `billing/quota_project`) | do not use; safe to delete |

**Why two key projects (India-specific):** the Gemini API paid tier in India runs on
*prepaid credits*; a key from a billing-enabled project routes to the paid tier and
fails with 429 "prepayment credits are depleted". A key from a **no-billing** project
gets the free tier (~250 req/day, ~10 RPM) — exactly what AI Studio free keys are.
Maps has no such problem: its $200/month free credit works on the billing-enabled
project.

## The deployed service

- **Service**: `matchday-command`, region `asia-south1`, URL
  `https://matchday-command-1069049902747.asia-south1.run.app`
- **`--max-instances 1` is load-bearing** (in-memory shared match + task queue —
  see architecture.md). Never raise it without moving that state to a broker.
- `--allow-unauthenticated` (public demo).
- Container: `Dockerfile` (multi-stage, Next standalone output, node:22-alpine,
  listens on 8080). The `public/` dir must exist (COPY fails otherwise — it's
  tracked via `.gitkeep`).

### Runtime env vars (Cloud Run)

| Var | Value/source | Notes |
|---|---|---|
| `GEMINI_API_KEY` | key from `matchday-gemini-2624` | free tier; restricted to `generativelanguage.googleapis.com` |
| `GEMINI_MODEL` | `gemini-3.5-flash` | 2.5-flash is retired for new keys |
| `MAPS_API_KEY` | key from `matchday-command-2624` | restricted to Maps/Static-Maps/Geocoding APIs; served to browsers via `/api/config` (browser Maps keys are client-visible by design). ⚠ Not yet referrer-restricted — locking it to the run.app domain is a known TODO |

**⚠ THE ENV-VAR TRAP (this bit us once):** `--set-env-vars` REPLACES the entire set —
setting one var deletes the others. Always use:
```powershell
gcloud run services update matchday-command --region asia-south1 --update-env-vars "KEY=value"
```

Local dev mirrors these in `.env.local` (gitignored):
`GEMINI_API_KEY=… / GEMINI_MODEL=gemini-3.5-flash / MAPS_API_KEY=…`.
Recover a lost key string:
```powershell
gcloud services api-keys list --project=<proj> --format="value(name,displayName)"
gcloud services api-keys get-key-string <keyName> --format="value(keyString)"
```
Key display names: `matchday-command-gemini-free` (gemini project),
`matchday-command-maps` (app project).

## Deploying

```powershell
npm run typecheck; npm run build          # must be clean first
gcloud run deploy matchday-command --source . --region asia-south1 `
  --allow-unauthenticated --max-instances 1 --quiet
```
- Source deploys build remotely on Cloud Build (~3–6 min). Env vars persist across
  deploys; only `--set-env-vars` clobbers them.
- After deploy, run the production verification recipes in api-reference.md
  (shared clock, one AI endpoint, pages render).
- Deploy restarts wipe the in-memory match and task queue — expected.

### Known deploy failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `PERMISSION_DENIED … default service account is missing required IAM permissions` | project whose compute default SA lacks grants (the abandoned project's disease) | use `matchday-command-2624`, whose SA has `roles/editor` + Cloud Build SA has `builds.builder` |
| `artifactregistry.repositories.get denied` seconds after creating a project/API | IAM propagation lag | wait ~60–90s, retry |
| every gcloud call fails with SERVICE_DISABLED on an unrelated project | stale `billing/quota_project` in local gcloud config | `gcloud config unset billing/quota_project` |

## CI

`.github/workflows/ci.yml`: on push/PR to main — Node 22, `npm ci`,
`npm run typecheck`, `npm run build`. No deploy step (deploys are manual via
gcloud). Keep it green; it's the only automated gate.

## Costs

Cloud Run: scale-to-zero, negligible at demo traffic (SSE keeps an instance warm
only while someone watches). Cloud Build: per-deploy minutes, small. Maps: far under
the $200/month credit. Gemini: free tier — the budget is the 250 req/day quota, not
money. Open-Meteo: free, keyless. Total steady-state cost ≈ ₹0 at demo scale.

## Git & repo practices

- Public repo; MIT license; `main` is the only branch; commits pushed directly.
- Never commit `.env.local` or key strings (gitignore covers `.env*`; keys in docs
  are referenced by display name, never by value).
- CRLF warnings on commit are normal on this Windows checkout — harmless, don't
  "fix" them with attribute churn.
- Commit messages: imperative summary + bullet body (see `git log` for the style).
