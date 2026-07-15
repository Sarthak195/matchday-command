import { NextResponse, type NextRequest } from "next/server";
import { Type } from "@google/genai";
import { geminiErrorMessage, generateJson } from "@/lib/gemini";
import { rateLimitResponse } from "@/lib/rate-limit";
import { DEMO_VENUE } from "@/shared/constants";
import {
  clampPriority,
  STAFF_ROLES,
  SUPPLY_ITEMS,
  type DemandLine,
  type DemandPlan,
  type StaffTask,
  type SupplyItem,
  type WeatherForecast,
} from "@/shared/models";

export const dynamic = "force-dynamic";

/** Opening stock on hand, so the model computes real shortfalls (gap). */
const DEFAULT_STOCK: Record<SupplyItem, number> = {
  umbrella: 200,
  poncho: 300,
  "bottled-water": 5000,
  "cold-drink": 4000,
  "hot-beverage": 1500,
  "hot-food": 2000,
  "cold-food": 2500,
  "handheld-fan": 400,
  blanket: 150,
  ice: 800,
  "energy-drink": 1200,
};

interface DemandRequest {
  minute: number;
  phase: string;
  attendance: number;
  weather: WeatherForecast;
  currentStock?: Partial<Record<SupplyItem, number>>;
}

const DEMAND_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    weatherBasis: { type: Type.STRING },
    summary: { type: Type.STRING },
    lines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING, enum: [...SUPPLY_ITEMS] },
          predictedUnits: { type: Type.INTEGER },
          currentStock: { type: Type.INTEGER },
          driver: { type: Type.STRING },
          urgency: { type: Type.STRING, enum: ["now", "before-kickoff", "by-halftime", "monitor"] },
        },
        required: ["item", "predictedUnits", "currentStock", "driver", "urgency"],
      },
    },
    prepTasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING, enum: [...STAFF_ROLES] },
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
          priority: { type: Type.INTEGER },
          dueBy: { type: Type.STRING },
        },
        required: ["role", "title", "detail", "priority", "dueBy"],
      },
    },
  },
  required: ["weatherBasis", "summary", "lines", "prepTasks"],
};

const SYSTEM = `You are the concessions & logistics planner for ${DEMO_VENUE.name} (capacity ${DEMO_VENUE.capacity.toLocaleString()}). From the weather forecast, expected attendance, and match phase, predict supply demand for the match window and issue crisp prep/stocking orders to staff. Rules: hot weather drives cold drinks, water, ice, handheld fans; rain/storm drives ponchos and umbrellas and shifts food from cold to hot; cold weather drives hot beverages, hot food, blankets. Predicted units should scale with attendance. Only recommend items from the allowed list. Prep tasks must be specific and name a concourse or stand where useful. Be realistic, not alarmist.`;

interface GeneratedDemand {
  weatherBasis: string;
  summary: string;
  lines: Array<Omit<DemandLine, "gap">>;
  prepTasks: Array<Omit<StaffTask, "id" | "createdAtMinute" | "origin" | "status">>;
}

/** POST weather + attendance + phase; returns a DemandPlan and prep StaffTasks. */
export async function POST(req: NextRequest) {
  const limited = rateLimitResponse(req, "demand", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  let body: DemandRequest;
  try {
    body = (await req.json()) as DemandRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const attendance = Number(body.attendance);
  if (!Number.isFinite(attendance)) {
    return NextResponse.json({ error: "attendance must be a number" }, { status: 400 });
  }

  const stock = { ...DEFAULT_STOCK, ...(body.currentStock ?? {}) };
  const prompt = [
    `Match clock: minute ${body.minute} (kickoff at 60), phase ${body.phase}.`,
    `Expected attendance: ${attendance.toLocaleString()}.`,
    "",
    "Weather forecast:",
    JSON.stringify(body.weather, null, 2),
    "",
    "Current stock on hand:",
    JSON.stringify(stock, null, 2),
  ].join("\n");

  try {
    const gen = await generateJson<GeneratedDemand>({
      system: SYSTEM,
      prompt,
      schema: DEMAND_SCHEMA,
    });

    const lines: DemandLine[] = gen.lines.map((l) => ({
      ...l,
      gap: l.predictedUnits - l.currentStock,
    }));
    const plan: DemandPlan = {
      id: `dmd-${body.minute}`,
      generatedAtMinute: body.minute,
      weatherBasis: gen.weatherBasis,
      summary: gen.summary,
      lines,
    };
    const tasks: StaffTask[] = gen.prepTasks.map((t, i) => ({
      ...t,
      priority: clampPriority(t.priority),
      id: `task-dmd-${body.minute}-${i}`,
      createdAtMinute: body.minute,
      origin: "demand",
      status: "pending",
    }));

    return NextResponse.json({ plan, tasks });
  } catch (err) {
    const message = geminiErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
