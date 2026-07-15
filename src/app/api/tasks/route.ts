import { NextResponse, type NextRequest } from "next/server";
import { addTask, listTasks } from "@/lib/store";
import { rateLimitResponse } from "@/lib/rate-limit";
import { clampPriority, STAFF_ROLES, type StaffRole, type TaskOrigin } from "@/shared/models";

export const dynamic = "force-dynamic";

/** Reject oversized free-text so the in-memory store can't be bloated. */
const MAX_FIELD_LEN = 500;

const ORIGINS: TaskOrigin[] = [
  "incident",
  "demand",
  "weather",
  "traffic",
  "match",
  "copilot",
  "emergency",
];

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
  const limited = rateLimitResponse(req, "tasks", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  let body: TaskInput;
  try {
    body = (await req.json()) as TaskInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!STAFF_ROLES.includes(body.role) || !body.title || !body.detail) {
    return NextResponse.json({ error: "role, title, and detail are required" }, { status: 400 });
  }
  if (body.title.length > MAX_FIELD_LEN || body.detail.length > MAX_FIELD_LEN) {
    return NextResponse.json(
      { error: `title and detail must be under ${MAX_FIELD_LEN} characters` },
      { status: 400 },
    );
  }
  const priority = clampPriority(body.priority ?? 2);
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
