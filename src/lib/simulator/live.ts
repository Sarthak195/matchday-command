import { SIM_TICK_MS } from "@/shared/constants";
import type { Incident, StadiumEvent, StreamMessage } from "@/shared/models";
import { IncidentDetector } from "./detector";
import { SimulationEngine } from "./engine";

/**
 * THE match. One server-side simulation shared by every connected client, so
 * the ops room, staff console, tournament view — and a judge's phone — all see
 * the same clock and the same story. Late joiners get a catch-up burst; sim
 * controls (speed/jump/restart) are global by design: this is a control room,
 * not a per-viewer replay.
 *
 * Single Cloud Run instance (--max-instances 1) makes the singleton safe.
 * Ticking pauses when nobody is watching. Kept on globalThis to survive dev HMR.
 */

type Send = (msg: StreamMessage) => void;

export type SimControl =
  | { type: "speed"; tickMs: number }
  | { type: "jump"; toMinute: number }
  | { type: "restart" };

const MAX_MINUTE = 200;
const EVENT_LOG_CAP = 500;

class LiveMatch {
  private engine = new SimulationEngine();
  private detector = new IncidentDetector();
  private eventLog: StadiumEvent[] = [];
  private incidents: Incident[] = [];
  private subscribers = new Set<Send>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickMs = SIM_TICK_MS;

  get minute(): number {
    return this.engine.clockMinute;
  }

  subscribe(send: Send): () => void {
    // Catch-up burst so a late joiner rebuilds the same picture.
    for (const event of this.eventLog.slice(-250)) send({ kind: "event", event });
    for (const incident of this.incidents) send({ kind: "incident", incident });
    send({ kind: "clock", minute: this.engine.clockMinute });
    this.subscribers.add(send);
    this.ensureTicking();
    return () => {
      this.subscribers.delete(send);
      if (this.subscribers.size === 0) this.pause();
    };
  }

  control(action: SimControl): void {
    switch (action.type) {
      case "speed": {
        this.tickMs = Math.min(Math.max(action.tickMs, 250), 10000);
        this.pause();
        this.ensureTicking();
        break;
      }
      case "jump": {
        const target = Math.min(Math.max(action.toMinute, 0), MAX_MINUTE);
        while (this.engine.clockMinute < target) this.step();
        break;
      }
      case "restart": {
        this.engine = new SimulationEngine();
        this.detector = new IncidentDetector();
        this.eventLog = [];
        this.incidents = [];
        this.broadcast({ kind: "reset" });
        this.broadcast({ kind: "clock", minute: 0 });
        this.ensureTicking();
        break;
      }
    }
  }

  private step(): void {
    if (this.engine.clockMinute >= MAX_MINUTE) {
      this.pause();
      return;
    }
    const events = this.engine.tick();
    this.eventLog.push(...events);
    if (this.eventLog.length > EVENT_LOG_CAP) {
      this.eventLog.splice(0, this.eventLog.length - EVENT_LOG_CAP);
    }
    this.broadcast({ kind: "clock", minute: this.engine.clockMinute });
    for (const event of events) this.broadcast({ kind: "event", event });
    for (const incident of this.detector.process(events, this.engine.clockMinute)) {
      this.incidents.push(incident);
      this.broadcast({ kind: "incident", incident });
    }
  }

  private broadcast(msg: StreamMessage): void {
    for (const send of this.subscribers) {
      try {
        send(msg);
      } catch {
        // dead subscriber — its abort handler will unsubscribe it
      }
    }
  }

  private ensureTicking(): void {
    if (!this.timer && this.subscribers.size > 0) {
      this.timer = setInterval(() => this.step(), this.tickMs);
    }
  }

  private pause(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

const g = globalThis as unknown as { __mdcLiveMatch?: LiveMatch };

export function getLiveMatch(): LiveMatch {
  g.__mdcLiveMatch ??= new LiveMatch();
  return g.__mdcLiveMatch;
}
