import { NextResponse, type NextRequest } from "next/server";
import { addTask, listTasks } from "@/lib/store";
import type { StaffRole, TaskOrigin } from "@/shared/models";

export const dynamic = "force-dynamic";

const ROLES: StaffRole[] = [
  "catering",
  "concessions",
  "stewarding",
  "security",
  "medical",
  "facilities",
  "traffic",
  "logistics",
];

const ORIGINS: TaskOrigin[] = ["incident", "demand", "weather", "traffic", "match", "copilot"];

/** The staff console polls this for tasks dispatched from the ops side. */
export async function GET() {
  return NextResponse.json({ tasks: listTasks() });
}

interface TaskInput {
  role: StaffRole;
  title: string;
  detail: string;
  priority: number;
  dueBy?: string;
  origin?: TaskOrigin;
  createdAtMinute?: number;
}

export async function POST(req: NextRequest) {
  let body: TaskInput;
  try {
    body = (await req.json()) as TaskInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!ROLES.includes(body.role) || !body.title || !body.detail) {
    return NextResponse.json({ error: "role, title, and detail are required" }, { status: 400 });
  }
  const priority = Math.min(3, Math.max(1, Math.round(body.priority ?? 2))) as 1 | 2 | 3;
  const task = addTask({
    role: body.role,
    title: body.title,
    detail: body.detail,
    priority,
    dueBy: body.dueBy,
    origin: ORIGINS.includes(body.origin as TaskOrigin) ? (body.origin as TaskOrigin) : "copilot",
    createdAtMinute: Math.max(0, Math.round(body.createdAtMinute ?? 0)),
  });
  return NextResponse.json({ task });
}
