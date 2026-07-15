import type { NextConfig } from "next";

/**
 * Content-Security-Policy. Google Maps (loaded at runtime in venue-map.tsx) needs
 * maps.googleapis.com for scripts/XHR and the *.gstatic/*.google hosts for tiles;
 * Next.js + Tailwind emit inline scripts/styles, hence 'unsafe-inline'. Applied
 * only in production so it can't interfere with the dev server's HMR/eval.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.google.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https://maps.googleapis.com https://*.googleapis.com",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy", value: CSP }]
    : []),
];

const nextConfig: NextConfig = {
  // Standalone output produces a self-contained server.js for the Cloud Run Dockerfile.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
