import type { NextRequest } from "next/server";
import type { StreamMessage } from "@/shared/models";
import { getLiveMatch } from "@/lib/simulator/live";

export const dynamic = "force-dynamic";

/**
 * Live match-day feed as Server-Sent Events. Every connection subscribes to
 * THE shared match (see src/lib/simulator/live.ts) — all viewers see the same
 * clock and story, and late joiners get a catch-up burst. Global sim controls
 * live at POST /api/sim.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const live = getLiveMatch();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (msg: StreamMessage) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const unsubscribe = live.subscribe(send);
      req.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed by the runtime
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
