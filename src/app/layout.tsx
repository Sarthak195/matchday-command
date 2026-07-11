import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://matchday-command-1069049902747.asia-south1.run.app"),
  title: "MatchDay Command",
  description:
    "AI incident command copilot for smart stadiums and tournament operations — live simulated telemetry, Gemini triage, ops briefings.",
  openGraph: {
    title: "MatchDay Command",
    description:
      "The stadium control room, with an AI copilot: live signals in, triaged incidents and ops briefings out.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
