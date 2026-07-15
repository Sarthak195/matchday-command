/**
 * Fixed-window in-memory rate limiter. The app runs as a single Cloud Run
 * instance (--max-instances 1) by design, so a module-level Map is sufficient;
 * a restart simply resets every window. Guards the AI/mutating routes against
 * a single client hammering them (cost + shared-demo disruption).
 */

interface Window {
  count: number;
  resetAt: number;
}

/** Keep the map from growing unbounded under many distinct clients. */
const MAX_KEYS = 10_000;
const windows = new Map<string, Window>();

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets (for a Retry-After header) when blocked. */
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  opts: RateLimitOptions,
  now: number = Date.now(),
): RateLimitResult {
  const existing = windows.get(key);

  if (!existing || now >= existing.resetAt) {
    if (windows.size >= MAX_KEYS) {
      for (const [k, w] of windows) if (now >= w.resetAt) windows.delete(k);
    }
    windows.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (existing.count >= opts.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  existing.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client identity from the proxy chain (Cloud Run sets XFF). */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

/**
 * Route guard: returns a 429 Response if the client is over the limit for
 * `name`, or null to proceed. Usage: `const r = rateLimitResponse(req, "triage",
 * {limit: 30, windowMs: 60_000}); if (r) return r;`
 */
export function rateLimitResponse(
  req: Request,
  name: string,
  opts: RateLimitOptions,
): Response | null {
  const rl = rateLimit(`${name}:${clientKey(req)}`, opts);
  if (rl.ok) return null;
  return Response.json(
    { error: "Too many requests — slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
  );
}

/** Reset all windows — test hook only. */
export function __resetRateLimits(): void {
  windows.clear();
}
