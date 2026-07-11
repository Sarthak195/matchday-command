"use client";

import { useEffect, useRef, useState } from "react";
import { ACCENT, STATUS } from "@/lib/theme";

/**
 * Floating control-room copilot chat. Sends chat history + a live state
 * snapshot to /api/copilot; executes returned tool calls via the callbacks
 * (open incident, dispatch staff task, generate briefing) and echoes a
 * confirmation line into the chat.
 */

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  kind?: "action" | "error";
}

const SUGGESTIONS = [
  "What needs my attention?",
  "Task catering to start hot food prep",
  "Any risks in the next 15 minutes?",
];

export function Copilot({
  snapshot,
  onToolCall,
}: {
  /** Called at send time so the model always sees the current state. */
  snapshot: () => unknown;
  /** Executes one tool call; returns a human confirmation line. */
  onToolCall: (call: ToolCall) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    const history = [...messages, { role: "user" as const, text: trimmed }];
    setMessages(history);
    setBusy(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.filter((m) => !m.kind).map(({ role, text }) => ({ role, text })),
          snapshot: snapshot(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Copilot failed");
      const additions: ChatMessage[] = [];
      if (data.text) additions.push({ role: "assistant", text: data.text });
      for (const call of (data.toolCalls ?? []) as ToolCall[]) {
        try {
          const confirmation = await onToolCall(call);
          additions.push({ role: "assistant", text: confirmation, kind: "action" });
        } catch (err) {
          additions.push({
            role: "assistant",
            text: `⚠ ${call.name} failed: ${err instanceof Error ? err.message : "unknown error"}`,
            kind: "error",
          });
        }
      }
      if (additions.length === 0) {
        additions.push({ role: "assistant", text: "(no response)", kind: "error" });
      }
      setMessages((prev) => [...prev, ...additions]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `⚠ ${err instanceof Error ? err.message : "Copilot failed"}`,
          kind: "error",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
        style={{ backgroundColor: "#1c5cab" }}
      >
        ✦ Copilot
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex max-h-[70vh] w-[min(400px,calc(100vw-2.5rem))] flex-col rounded-lg border border-white/10 bg-[#1a1a19] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>
          ✦ Control-room copilot
        </p>
        <button onClick={() => setOpen(false)} className="text-sm text-[#898781] hover:text-white">
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="min-h-[180px] flex-1 space-y-2.5 overflow-y-auto p-3.5">
        {messages.length === 0 && (
          <div>
            <p className="text-xs text-[#898781]">
              Ask about the live state, or tell me to act — I can open incidents, dispatch staff
              tasks, and generate briefings.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[#c3c2b7] hover:bg-white/5"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-1.5 text-sm ${
                m.role === "user" ? "bg-[#1c5cab] text-white" : "bg-[#0d0d0d] text-[#c3c2b7]"
              }`}
              style={
                m.kind === "action"
                  ? { border: `1px solid ${STATUS.good}66`, color: "#e6efe6" }
                  : m.kind === "error"
                    ? { border: `1px solid ${STATUS.serious}66` }
                    : undefined
              }
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-[#898781]">Thinking…</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex gap-2 border-t border-white/10 p-2.5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask or command…"
          className="min-w-0 flex-1 rounded border border-white/10 bg-[#0d0d0d] px-2.5 py-1.5 text-sm text-white placeholder:text-[#898781] focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded bg-[#1c5cab] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
