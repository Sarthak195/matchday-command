"use client";

import { useEffect, useState } from "react";
import { STATUS } from "@/lib/theme";

/**
 * Push-to-talk radio reports via the browser's built-in Web Speech API
 * (free, keyless; Chrome/Edge). The transcript is injected into the live
 * feed as a radio-log event, where it flows into triage/briefing context
 * like any other signal.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function getRecognizer(): any | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceRadio({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [status, setStatus] = useState<"idle" | "listening" | "unsupported" | "error">("idle");

  useEffect(() => {
    if (!getRecognizer()) setStatus("unsupported");
  }, []);

  function start() {
    const SR = getRecognizer();
    if (!SR || status === "listening") return;
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript;
      if (transcript) onTranscript(transcript);
      setStatus("idle");
    };
    rec.onerror = () => setStatus("error");
    rec.onend = () => setStatus((s) => (s === "listening" ? "idle" : s));
    setStatus("listening");
    rec.start();
  }

  if (status === "unsupported") {
    return (
      <span className="text-[10px] text-[#898781]" title="Web Speech API not available in this browser">
        mic n/a
      </span>
    );
  }

  return (
    <button
      onClick={start}
      title="Push to talk — speak a radio report into the feed"
      className="rounded border border-white/10 px-2 py-0.5 text-[11px] text-white hover:bg-white/5"
      style={status === "listening" ? { borderColor: STATUS.critical, color: STATUS.critical } : undefined}
    >
      {status === "listening" ? "● Listening…" : status === "error" ? "🎙 Retry" : "🎙 Radio report"}
    </button>
  );
}
