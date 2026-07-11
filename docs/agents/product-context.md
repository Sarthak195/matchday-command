# Product context — why this project is shaped the way it is

## The competition

**Google PromptWars** (promptwars.in, run with Hack2Skill): India-based, **solo
participants only**, "vibe coding" format — AI-assisted building is the point, working
deployed demos beat feature breadth. Bi-weekly themed challenges; this entry targets
the **Smart Stadiums & Tournament Operations** theme, timed to the FIFA World Cup 2026
(the real tournament used digital twins of all 16 stadiums and predictive crowd
management — that's the industry backdrop the pitch leans on).

The builder is a student at Medi-Caps University, Indore (GitHub: Sarthak195) — which
is why the fictional venue ("Meridian Arena") is placed in Indore and why the map,
weather, and traffic fixtures use real Indore coordinates (22.7243, 75.8712).

## The core positioning decision

Most entries on this theme build **fan-facing chatbots** (navigation, food, tickets) —
a prior entry, "StadiumIQ", did exactly that. This project deliberately sits on the
other side of the glass: the **operations control room**. The pitch line: *"Every
stadium AI you'll see today talks to fans. This one runs the stadium."*

Keep this positioning in mind when adding features: fan-facing surface area is
intentionally minimal. If a fan-facing feature is ever added, it should be ambient
info (queue times, best gate), never a chatbot.

## Honest-framing decisions (do not undo these)

Two user requests were deliberately reframed to stay truthful — judges can and do
poke at inflated claims:

1. **"Control traffic"** → an *advisory/dispatch* layer. No commercial API can switch
   public road signals. What we do: model approach congestion, recommend routing and
   parking steers, and (narratively) drive sign content. Never claim signal control.
2. **"Command staff to start cooking"** → a *staff tasking system*. The AI predicts
   demand and dispatches prep/stocking orders to role queues; humans execute.

Similarly, the tournament view labels sister venues **"simulated"** and only Meridian
Arena **"● LIVE"** — honesty about what's real is a feature, not a limitation. The
footer on every view says "Simulated telemetry · AI output is generated from
on-screen events only".

## Why the data is simulated (the defensible answer)

Real stadium telemetry isn't accessible to a solo student in a two-week sprint. The
simulator makes the demo **deterministic** (same story every run — critical for
rehearsed demos and for judges reproducing it) and **unbreakable** (no hardware, no
rate limits, no dead APIs at judging time). The architecture is sensor-agnostic: the
SSE contract (`StreamMessage`) is the integration point a real venue would plug into.
External data that IS free and reliable is real: Open-Meteo weather, Google Maps
traffic tiles.

## The demo story (choreography constraints)

`docs/DEMO_SCRIPT.md` is the 3-minute judge-facing script, and
`src/lib/simulator/scenario.ts` is that script **in data form** — if you change one,
change the other. The scripted beats exist to give each feature a moment:

- 28′ Gate C queue surge + steward radio → incident detection + AI triage moment
- 41′ North Concourse density spike → second incident, queue pressure
- 60′ kickoff, 68′ medical in Block 12 → severity ranking moment
- 75′ storm approaching → weather incident + demand-forecast tie-in
- 83′ goal, 105′ halftime → briefing moment, 165′ full time → egress traffic

Predictive warnings fire naturally in the ~35–55′ window as arrival curves build.
The emergency mode is the demo finale. Demo controls: global sim speed (1×/4×),
"⏭ Next beat" fast-forward, "↺ Restart" — all global because every view follows the
one shared match.

## Prize constraints that shape engineering

- **Solo rule** → prefer polish and demoability over breadth; no feature should need
  two people to demo.
- **Free-tier Gemini (≈250 req/day)** → all AI calls are user-triggered; never poll
  Gemini on a timer.
- **Judges may open the live URL on their own device** → late joiners must sync to
  the shared match (catch-up burst), and the app must never require setup.
