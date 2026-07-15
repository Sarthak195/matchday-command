import { NextResponse, type NextRequest } from "next/server";
import { Type } from "@google/genai";
import { geminiErrorMessage, generateJson } from "@/lib/gemini";
import { rateLimitResponse } from "@/lib/rate-limit";
import { DEMO_VENUE } from "@/shared/constants";
import type { StadiumEvent, TriageResult } from "@/shared/models";

export const dynamic = "force-dynamic";

interface TriageRequest {
  title: string;
  category: string;
  zoneId?: string;
  contextEvents: StadiumEvent[];
}

const TRIAGE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    severity: {
      type: Type.STRING,
      enum: ["info", "low", "medium", "high", "critical"],
    },
    rationale: { type: Type.STRING },
    recommendedActions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING },
          assignTo: {
            type: Type.STRING,
            enum: ["security", "medical", "facilities", "stewarding"],
          },
          priority: { type: Type.INTEGER },
        },
        required: ["action", "assignTo", "priority"],
      },
    },
    escalate: { type: Type.BOOLEAN },
  },
  required: ["summary", "severity", "rationale", "recommendedActions", "escalate"],
};

const SYSTEM = `You are the duty manager's copilot in the operations control room of ${DEMO_VENUE.name} (capacity ${DEMO_VENUE.capacity.toLocaleString()}). Triage the incident using only the supplied telemetry. Be specific: name gates, zones, and staff channels. Recommend the smallest set of actions that keeps people safe. Never invent facts not present in the events.`;

/** POST an incident + its source events; returns a Gemini TriageResult. */
export async function POST(req: NextRequest) {
  const limited = rateLimitResponse(req, "triage", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  let body: TriageRequest;
  try {
    body = (await req.json()) as TriageRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = [
    `Incident: ${body.title}`,
    `Category: ${body.category}`,
    body.zoneId ? `Zone: ${body.zoneId}` : null,
    "",
    "Telemetry (most recent last):",
    JSON.stringify(body.contextEvents ?? [], null, 2),
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    const triage = await generateJson<TriageResult>({
      system: SYSTEM,
      prompt,
      schema: TRIAGE_SCHEMA,
    });
    return NextResponse.json(triage);
  } catch (err) {
    const message = geminiErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
