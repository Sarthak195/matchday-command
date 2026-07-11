import type { NextRequest } from "next/server";
import { SIM_TICK_MS } from "@/shared/constants";
import type { StreamMessage } from "@/shared/models";
import { IncidentDetector } from "@/lib/simulator/detector";
import { SimulationEngine } from "@/lib/simulator/engine";

export const dynamic = "force-dynamic";

/**
 * Live match-day feed as Server-Sent Events. Each `data:` line is one
 * JSON-encoded StreamMessage (see src/shared/models/stream.ts).
 * Each connection runs its own deterministic simulation, so every viewer
 * gets the full story from minute 0. `?tickMs=500` speeds up the demo.
 */
export async function GET(req: NextRequest) {
  const tickParam = Number(req.nextUrl.searchParams.get("tickMs"));
  const tickMs = Number.isFinite(tickParam) && tickParam > 0
    ? Math.min(Math.max(tickParam, 250), 10000)
    : SIM_TICK_MS;

  const encoder = new TextEncoder();
  const engine = new SimulationEngine();
  const detector = new IncidentDetector();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (msg: StreamMessage) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      };

      const timer = setInterval(() => {
        const events = engine.tick();
        send({ kind: "clock", minute: engine.clockMinute });
        for (const event of events) {
          send({ kind: "event", event });
        }
        for (const incident of detector.process(events, engine.clockMinute)) {
          send({ kind: "incident", incident });
        }
      }, tickMs);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(timer);
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
