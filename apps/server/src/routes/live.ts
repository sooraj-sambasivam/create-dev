import { Router } from "express";
import { createRateLimiter } from "../middleware/rateLimit";
import { createTtlCache } from "../live/cache";
import {
  LIVE_CATALOG,
  LiveError,
  SOURCES,
  isLiveId,
  type Fetcher,
  type LiveParams,
  type LiveResult,
} from "../live/sources";

export const LIVE_CACHE_MS = 60_000;
export const LIVE_PER_MINUTE = 60;

export type LiveResponse = LiveResult & { updatedAt: string };

export type LiveRouterOptions = {
  fetch?: Fetcher;
  now?: () => number;
  env?: Record<string, string | undefined>;
  perMinute?: number;
};

/** Express query values -> plain string params. Arrays and nested objects are refused. */
function readParams(query: Record<string, unknown>): LiveParams {
  const out: LiveParams = {};
  for (const [k, v] of Object.entries(query)) {
    if (typeof v !== "string") throw new LiveError(400, `Parameter "${k.slice(0, 30)}" must be a single value.`);
    out[k] = v;
  }
  return out;
}

export function createLiveRouter(options: LiveRouterOptions = {}): Router {
  const now = options.now ?? Date.now;
  const doFetch: Fetcher = options.fetch ?? ((url, init) => fetch(url, init));
  const cache = createTtlCache<LiveResponse>(LIVE_CACHE_MS, 500, now);
  const limiter = createRateLimiter({ windowMs: 60_000, max: options.perMinute ?? LIVE_PER_MINUTE, now });
  const router = Router();

  /** GET /api/live -> LiveCatalog */
  router.get("/live", (_req, res) => {
    res.json(LIVE_CATALOG);
  });

  /** GET /api/live/:id?param=... -> { value, display, updatedAt, source } */
  router.get("/live/:id", limiter, async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!isLiveId(id)) throw new LiveError(404, "Unknown live source.");
      const source = SOURCES[id];
      const params = source.validate(readParams(req.query as Record<string, unknown>));
      const key = `${id}?${Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join("&")}`;
      const cached = cache.get(key);
      if (cached) {
        res.set("Cache-Control", "private, max-age=30");
        res.json(cached);
        return;
      }
      const env = options.env ?? process.env;
      const result = await source.load(params, { fetch: doFetch, now: () => new Date(now()), env });
      const body: LiveResponse = { ...result, updatedAt: new Date(now()).toISOString() };
      cache.set(key, body);
      res.set("Cache-Control", "private, max-age=30");
      res.json(body);
    } catch (err) {
      if (err instanceof LiveError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "Live data failed." });
    }
  });

  return router;
}

export const liveRouter = createLiveRouter();
