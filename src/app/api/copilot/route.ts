import { NextResponse, type NextRequest } from "next/server";
import { Type, type FunctionDeclaration } from "@google/genai";
import { geminiErrorMessage, getClient, getModel } from "@/lib/gemini";
import { DEMO_VENUE } from "@/shared/constants";
import { STAFF_ROLES } from "@/shared/models";

export const dynamic = "force-dynamic";

/**
 * Control-room copilot: chat over the live snapshot, with function calling so
 * the model can ACT — open incidents, dispatch staff tasks, trigger briefings.
 * The route is stateless: the client sends chat history + a state snapshot;
 * tool calls are returned to the client, which executes them locally.
 */

/** Most recent chat turns sent to the model — bounds prompt size and cost. */
const MAX_HISTORY = 12;

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface CopilotRequest {
  messages: ChatMessage[];
  snapshot: unknown;
}

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "open_incident",
    description:
      "Open a new incident in the ops queue (use when the operator reports or asks to log a problem, or when a projected breach should be acted on).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        category: {
          type: Type.STRING,
          enum: ["crowd", "medical", "security", "weather", "facilities", "other"],
        },
        severity: { type: Type.STRING, enum: ["info", "low", "medium", "high", "critical"] },
        zoneId: {
          type: Type.STRING,
          description: "Zone id like concourse-north / seating-bowl (optional)",
        },
      },
      required: ["title", "category", "severity"],
    },
  },
  {
    name: "dispatch_task",
    description:
      "Dispatch a work order to the staff console (e.g. start hot-food prep, move stock, stage stewards).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        role: {
          type: Type.STRING,
          enum: [...STAFF_ROLES],
        },
        title: { type: Type.STRING },
        detail: { type: Type.STRING, description: "Specific, actionable instruction" },
        priority: { type: Type.INTEGER, description: "1 = do now, 2 = soon, 3 = when able" },
        dueBy: { type: Type.STRING, description: 'e.g. "before kickoff", "by halftime" (optional)' },
      },
      required: ["role", "title", "detail", "priority"],
    },
  },
  {
    name: "generate_briefing",
    description: "Generate the periodic ops briefing document for the control room.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

function systemPrompt(snapshot: unknown): string {
  return `You are the duty manager's copilot in the operations control room of ${DEMO_VENUE.name} (capacity ${DEMO_VENUE.capacity.toLocaleString()}). Kickoff is at minute 60 of the ops clock.

Ground rules:
- Answer ONLY from CURRENT STATE below. Never invent telemetry. If the state doesn't show it, say so.
- Ops tone: terse, specific, decision-oriented. Name gates, zones, and roles. Keep answers under 120 words.
- Call a function ONLY when the operator gives an instruction to act (open/log an incident, task/tell/order staff to do something, generate a briefing). A question or status request gets a TEXT answer only — you may end it with one suggested action ("Say the word and I'll task stewarding"), but never execute an action that wasn't asked for.
- Early warnings are projections — flag them and recommend (not execute) pre-emptive action.

CURRENT STATE:
${JSON.stringify(snapshot)}`;
}

export async function POST(req: NextRequest) {
  let body: CopilotRequest;
  try {
    body = (await req.json()) as CopilotRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const history = (body.messages ?? []).slice(-MAX_HISTORY).filter((m) => m.text?.trim());
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user" }, { status: 400 });
  }

  try {
    const ai = getClient();
    const res = await ai.models.generateContent({
      model: getModel(),
      contents: history.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      })),
      config: {
        systemInstruction: systemPrompt(body.snapshot),
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      },
    });
    const toolCalls = (res.functionCalls ?? []).map((fc) => ({
      name: fc.name ?? "",
      args: (fc.args ?? {}) as Record<string, unknown>,
    }));
    return NextResponse.json({ text: res.text ?? null, toolCalls });
  } catch (err) {
    const message = geminiErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
