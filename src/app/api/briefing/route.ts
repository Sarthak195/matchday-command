import { NextResponse, type NextRequest } from "next/server";
import { Type } from "@google/genai";
import { geminiErrorMessage, generateJson } from "@/lib/gemini";
import { DEMO_VENUE } from "@/shared/constants";
import type { HandoverReport, Incident, OpsBriefing, StadiumEvent } from "@/shared/models";

export const dynamic = "force-dynamic";

interface BriefingRequest {
  minute: number;
  incidents: Incident[];
  recentEvents: StadiumEvent[];
  /** Only used for handovers, e.g. "Gates open → halftime". */
  shiftLabel?: string;
}

const BRIEFING_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    situation: { type: Type.STRING },
    watchItems: { type: Type.ARRAY, items: { type: Type.STRING } },
    crowdOutlook: { type: Type.STRING },
  },
  required: ["headline", "situation", "watchItems", "crowdOutlook"],
};

const HANDOVER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    narrative: { type: Type.STRING },
    actionsForNextShift: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["narrative", "actionsForNextShift"],
};

const SYSTEM = `You are the duty manager's copilot in the operations control room of ${DEMO_VENUE.name} (capacity ${DEMO_VENUE.capacity.toLocaleString()}). Write for the ops room, not for fans: terse, specific, decision-oriented. Name gates, zones, and channels. Use only the supplied telemetry and incident list — never invent facts.`;

function contextBlock(body: BriefingRequest): string {
  return [
    `Match clock: minute ${body.minute} (kickoff was minute 60).`,
    "",
    "Incidents (full list with status):",
    JSON.stringify(body.incidents, null, 2),
    "",
    "Recent telemetry (most recent last):",
    JSON.stringify(body.recentEvents, null, 2),
  ].join("\n");
}

/**
 * POST /api/briefing            -> OpsBriefing
 * POST /api/briefing?type=handover -> HandoverReport
 * The client sends its accumulated state; the server stays stateless.
 */
export async function POST(req: NextRequest) {
  let body: BriefingRequest;
  try {
    body = (await req.json()) as BriefingRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // Normalize the client-supplied collections so a malformed body can't throw a
  // TypeError mid-handler (which would surface as a misleading Gemini-shaped 500).
  body.incidents = Array.isArray(body.incidents) ? body.incidents : [];
  body.recentEvents = Array.isArray(body.recentEvents) ? body.recentEvents : [];
  const isHandover = req.nextUrl.searchParams.get("type") === "handover";

  try {
    if (isHandover) {
      const generated = await generateJson<Pick<HandoverReport, "narrative" | "actionsForNextShift">>({
        system: SYSTEM,
        prompt: `Write the shift-handover report for "${body.shiftLabel ?? "current shift"}". Summarize what happened, what was decided and why, and what the incoming shift must pick up.\n\n${contextBlock(body)}`,
        schema: HANDOVER_SCHEMA,
      });
      const report: HandoverReport = {
        id: `hnd-${body.minute}`,
        shift: body.shiftLabel ?? "Current shift",
        generatedAtMinute: body.minute,
        narrative: generated.narrative,
        actionsForNextShift: generated.actionsForNextShift,
        resolvedIncidentIds: body.incidents.filter((i) => i.status === "resolved").map((i) => i.id),
        openIncidentIds: body.incidents.filter((i) => i.status !== "resolved").map((i) => i.id),
      };
      return NextResponse.json(report);
    }

    const generated = await generateJson<
      Pick<OpsBriefing, "headline" | "situation" | "watchItems" | "crowdOutlook">
    >({
      system: SYSTEM,
      prompt: `Write the periodic operations briefing for the control room right now.\n\n${contextBlock(body)}`,
      schema: BRIEFING_SCHEMA,
    });
    const briefing: OpsBriefing = {
      id: `brf-${body.minute}`,
      generatedAtMinute: body.minute,
      headline: generated.headline,
      situation: generated.situation,
      watchItems: generated.watchItems,
      crowdOutlook: generated.crowdOutlook,
      openIncidentIds: body.incidents.filter((i) => i.status !== "resolved").map((i) => i.id),
    };
    return NextResponse.json(briefing);
  } catch (err) {
    const message = geminiErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
