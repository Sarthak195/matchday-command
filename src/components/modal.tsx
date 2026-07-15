"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog: it is labelled (`aria-label`), focus-trapped, closes
 * on Escape or backdrop click, and restores focus to the trigger on unmount.
 * The ops-room overlays (briefing/handover doc, emergency confirm, evacuation
 * plan) all render through this so keyboard and screen-reader users aren't
 * stranded in the venue's most safety-critical flows.
 */
export function Modal({
  onClose,
  label,
  children,
  className = "",
  style,
}: {
  onClose: () => void;
  /** Accessible name announced for the dialog. */
  label: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => !el.hasAttribute("disabled"),
          )
        : [];
    (focusables()[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={className}
        style={style}
      >
        {children}
      </div>
    </div>
  );
}
