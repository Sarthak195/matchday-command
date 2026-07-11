import { NextResponse, type NextRequest } from "next/server";
import { Type } from "@google/genai";
import { geminiErrorMessage, generateJson } from "@/lib/gemini";
import { addTask } from "@/lib/store";
import { DEMO_VENUE } from "@/shared/constants";
import type { EvacuationPlan, EvacZoneOrder, Incident, StaffRole, StaffTask } from "@/shared/models";

export const dynamic = "force-dynamic";

/**
 * Major-incident mode: Gemini writes the evacuation plan AND the staff work
 * orders. Tasks are dispatched server-side into the shared queue, so the staff
 * console picks them up on its next poll without any extra client wiring.
 */

interface EmergencyRequest {
  minute: number;
  reason: string;
  zones: Array<{ id: string; name: string; densityPct: number; occupancy: number }>;
  incidents: Incident[];
}

const ZONE_IDS = DEMO_VENUE.zones.map((z) => z.id);
const STAFF_ROLES: StaffRole[] = [
  "catering",
  "concessions",
  "stewarding",
  "security",
  "medical",
  "facilities",
  "traffic",
  "logistics",
];

const EVAC_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    paAnnouncement: { type: Type.STRING, description: "Calm, non-alarming, specific PA text" },
    commandSummary: { type: Type.STRING },
    zoneOrders: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          zoneId: { type: Type.STRING, enum: ZONE_IDS },
          instruction: { type: Type.STRING },
          exitVia: { type: Type.STRING },
          priority: { type: Type.INTEGER },
        },
        required: ["zoneId", "instruction", "exitVia", "priority"],
      },
    },
    staffTasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING, enum: STAFF_ROLES },
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
          priority: { type: Type.INTEGER },
        },
        required: ["role", "title", "detail", "priority"],
      },
    },
  },
  required: ["paAnnouncement", "commandSummary", "zoneOrders", "staffTasks"],
};

const SYSTEM = `You are the emergency coordinator of ${DEMO_VENUE.name} (capacity ${DEMO_VENUE.capacity.toLocaleString()}; gates A/B on the north plaza, C/D on the south plaza). A controlled evacuation has been ordered. Produce:
1. A PA announcement — calm, clear, no panic words, tells fans exactly where to go.
2. A command summary for the ops room — sequence and reasoning.
3. Zone-by-zone orders — sequence by density and exposure (densest and most exposed move first; the medical bay holds in place with staff); route zones to specific gates to avoid crossing flows.
4. Staff work orders per role (stewarding, security, medical, facilities, traffic at minimum).
Use only the supplied state. Be specific and realistic; this is a drill-quality plan, not marketing text.`;

interface GeneratedEvac {
  paAnnouncement: string;
  commandSummary: string;
  zoneOrders: Array<Omit<EvacZoneOrder, "zoneName">>;
  staffTasks: Array<{ role: StaffRole; title: string; detail: string; priority: number }>;
}

export async function POST(req: NextRequest) {
  let body: EmergencyRequest;
  try {
    body = (await req.json()) as EmergencyRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = [
    `Ops clock: minute ${body.minute} (kickoff at 60).`,
    `Declared reason: ${body.reason}`,
    "",
    "Zone state:",
    JSON.stringify(body.zones, null, 2),
    "",
    "Open incidents:",
    JSON.stringify(body.incidents, null, 2),
  ].join("\n");

  try {
    const gen = await generateJson<GeneratedEvac>({ system: SYSTEM, prompt, schema: EVAC_SCHEMA });

    const plan: EvacuationPlan = {
      id: `evac-${body.minute}`,
      generatedAtMinute: body.minute,
      paAnnouncement: gen.paAnnouncement,
      commandSummary: gen.commandSummary,
      zoneOrders: gen.zoneOrders.map((o) => ({
        ...o,
        priority: Math.min(3, Math.max(1, Math.round(o.priority))) as 1 | 2 | 3,
        zoneName: DEMO_VENUE.zones.find((z) => z.id === o.zoneId)?.name ?? o.zoneId,
      })),
    };

    const tasks: StaffTask[] = gen.staffTasks.map((t) =>
      addTask({
        role: t.role,
        title: `[EVAC] ${t.title}`,
        detail: t.detail,
        priority: Math.min(3, Math.max(1, Math.round(t.priority))) as 1 | 2 | 3,
        origin: "emergency",
        createdAtMinute: body.minute,
        dueBy: "immediately",
      }),
    );

    return NextResponse.json({ plan, tasks });
  } catch (err) {
    return NextResponse.json({ error: geminiErrorMessage(err) }, { status: 500 });
  }
}
