# 3-minute demo script

The scripted scenario in `src/lib/simulator/scenario.ts` **is** this demo. If you change one, change the other.

**Demo controls:** set sim speed to 4× before you start, and use **⏭ Next beat** to fast-forward to each story moment — the sim is deterministic, so jumping rebuilds the exact state instantly. Finish by clicking **↓ Export report** and showing the judges the markdown match-day report the ops room just "wrote".

**0:00 — Set the scene (15s).** "Every stadium AI you'll see today talks to fans. This one sits in the control room. Meridian Arena, 52,000 seats, gates just opened."

**0:15 — Show the pulse (30s).** Dashboard live: gates flowing, zones green, radio ticker scrolling. Point out this is a full match-day simulation — no hardware needed, fully reproducible.

**0:45 — First incident (60s).** Fast-forward to 28': Gate C queue hits 420 and a steward radios that scanners are slow. An incident auto-opens. Click **Triage** → Gemini returns severity, a rationale that cites *both* the queue numbers and the radio message, and prioritized actions ("redirect to Gate D", "stewarding channel, priority 1"). Emphasize: structured output, grounded only in the telemetry shown on screen.

**1:45 — Compounding pressure (45s).** 41': North Concourse density 89% → second incident. 68': medical call in Block 12 mid-match. Show the incident queue ranking by severity — this is the drowning-in-signals moment the tool exists for.

**2:30 — The payoff (30s).** Click **Generate briefing**: Gemini writes the ops-room situation report — open incidents, watch items (storm cell inbound at 75'), crowd outlook for halftime. "This document is what a duty manager writes by hand today. Judges, refresh the page — it's live on Cloud Run."

## The second act — staff console & demand (60s)

After the ops story, click **Staff view →**. "Same brain, different lens — this is what floor teams see." Point out the **live weather** (real Open-Meteo for Indore), then the **AI demand forecast**: Gemini turned the forecast + 46k attendance into a stocking plan — call out the biggest shortfall (e.g. "+30,000 bottled water, act now"). Then the **task board**: prep orders, traffic advisories, weather readiness, and incident response all dispatched to the right role, each with an ack → in-progress → done lifecycle. "The system doesn't just watch the stadium — it runs it."

Back on ops, the **Approach & traffic** panel shows the live Google map with real traffic and routing advisories ("steer arrivals to Ring Road, direct parking to Lot C").

## The third act — the agentic close (45s)

Around 35–45′, the **Early warnings** panel fires: "North Concourse on track to hit 85% in ~X min." Say: "reactive dashboards alert *after* thresholds break — this projects ahead." Then click **🎙 Radio report** and *speak*: "steward reporting a blocked stairway near block twelve" — the transcript lands in the feed. Open **✦ Copilot** and type "task stewarding to clear the blocked stairway at block 12, priority 1" — show the confirmation, then flip to the **staff console** where the task just appeared under Stewarding. Close with: "Predict, hear, decide, dispatch — one loop."

## Judge Q&A ammo

- *Why simulated data?* Real stadium telemetry isn't accessible to a solo student in a two-week sprint; the simulator makes the demo deterministic and the architecture is sensor-agnostic — the SSE contract is the integration point.
- *Why not a fan app?* Crowded space (see StadiumIQ and Google's own World Cup tools). Ops is underserved and matches the theme's second half: *tournament operations*.
- *What's genuinely AI here?* Unstructured radio logs + numeric telemetry fused into one triage judgment, and briefing prose generation — both things rules alone can't do.
