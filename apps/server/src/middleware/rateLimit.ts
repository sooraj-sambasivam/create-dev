import type { NextFunction, Request, Response } from "express";

export type RateLimitOptions = {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per key inside one window. */
  max: number;
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
};

const SWEEP_THRESHOLD = 10_000;

/**
 * In-memory sliding-window limiter keyed by req.ip. Each key keeps the timestamps of its recent
 * requests; a request is refused with 429 when `max` requests already fall inside the window.
 * State lives in this process only, so it resets on restart and is not shared across instances.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max } = options;
  const now = options.now ?? Date.now;
  const hits = new Map<string, number[]>();

  function sweep(currentTime: number): void {
    if (hits.size < SWEEP_THRESHOLD) return;
    for (const [key, times] of hits) {
      const recent = times.filter((t) => currentTime - t < windowMs);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
  }

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = req.ip ?? "unknown";
    const current = now();
    sweep(current);
    const recent = (hits.get(key) ?? []).filter((t) => current - t < windowMs);
    if (recent.length >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - current) / 1000));
      hits.set(key, recent);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ error: "Too many requests. Try again in a moment." });
      return;
    }
    recent.push(current);
    hits.set(key, recent);
    next();
  };
}
