import { NextResponse, type NextRequest } from "next/server";
import { getLiveMatch, type SimControl } from "@/lib/simulator/live";

export const dynamic = "force-dynamic";

/** Global controls for THE shared match: speed, jump-to-minute, restart. */
export async function POST(req: NextRequest) {
  let body: SimControl;
  try {
    body = (await req.json()) as SimControl;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.type !== "speed" && body.type !== "jump" && body.type !== "restart") {
    return NextResponse.json({ error: "Unknown control type" }, { status: 400 });
  }
  const live = getLiveMatch();
  live.control(body);
  return NextResponse.json({ ok: true, minute: live.minute });
}
