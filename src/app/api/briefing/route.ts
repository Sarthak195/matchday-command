import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * TODO: generate an OpsBriefing (and, with ?type=handover, a HandoverReport)
 * from the current OpsState via generateJson() — same pattern as /api/triage.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Not implemented yet — see docs/ARCHITECTURE.md roadmap" },
    { status: 501 },
  );
}
