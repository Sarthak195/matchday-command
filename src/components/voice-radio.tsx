"use client";

import { useEffect, useRef, useState } from "react";
import { CRITICAL_TEXT, STATUS } from "@/lib/theme";

/**
 * Push-to-talk radio reports via the browser's built-in Web Speech API
 * (free, keyless; Chrome/Edge). The transcript is injected into the live
 * feed as a radio-log event, where it flows into triage/briefing context
 * like any other signal.
 */

function getRecognizer(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function VoiceRadio({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [status, setStatus] = useState<"idle" | "listening" | "unsupported" | "error">("idle");
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!getRecognizer()) setStatus("unsupported");
    // Abort any live mic session if the component unmounts mid-listen (e.g. the
    // operator navigates away), so its handlers don't setState after unmount.
    return () => {
      mountedRef.current = false;
      recRef.current?.abort?.();
    };
  }, []);

  function start() {
    const SR = getRecognizer();
    if (!SR || status === "listening") return;
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results?.[0]?.[0]?.transcript;
      if (transcript) onTranscript(transcript);
      if (mountedRef.current) setStatus("idle");
    };
    rec.onerror = () => {
      if (mountedRef.current) setStatus("error");
    };
    rec.onend = () => {
      recRef.current = null;
      if (mountedRef.current) setStatus((s) => (s === "listening" ? "idle" : s));
    };
    setStatus("listening");
    rec.start();
  }

  if (status === "unsupported") {
    return (
      <span
        className="text-[10px] text-[#898781]"
        title="Web Speech API not available in this browser"
      >
        mic n/a
      </span>
    );
  }

  return (
    <button
      onClick={start}
      title="Push to talk — speak a radio report into the feed"
      className="rounded border border-white/10 px-2 py-0.5 text-[11px] text-white hover:bg-white/5"
      style={
        status === "listening" ? { borderColor: STATUS.critical, color: CRITICAL_TEXT } : undefined
      }
    >
      {status === "listening" ? "● Listening…" : status === "error" ? "🎙 Retry" : "🎙 Radio report"}
    </button>
  );
}
