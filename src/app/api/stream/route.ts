import type { NextRequest } from "next/server";
import { SIM_TICK_MS } from "@/shared/constants";
import type { StreamMessage } from "@/shared/models";
import { SimulationEngine } from "@/lib/simulator/engine";

export const dynamic = "force-dynamic";

/**
 * Live match-day feed as Server-Sent Events. Each `data:` line is one
 * JSON-encoded StreamMessage (see src/shared/models/stream.ts).
 * Currently: clock + scripted scenario events. TODO: incident detection rules.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const engine = new SimulationEngine();

  const stream = new ReadableStream({
    start(controller) {
      const send = (msg: StreamMessage) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));

      const timer = setInterval(() => {
        const events = engine.tick();
        send({ kind: "clock", minute: engine.clockMinute });
        for (const event of events) {
          send({ kind: "event", event });
        }
      }, SIM_TICK_MS);

      req.signal.addEventListener("abort", () => {
        clearInterval(timer);
        controller.close();
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
