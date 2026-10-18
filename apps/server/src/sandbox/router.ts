import { Router, type Request, type Response } from "express";
import { createRateLimiter } from "../middleware/rateLimit";
import {
  invokeSandbox,
  publishedSandboxId,
  sandboxExists,
  SESSION_ID_RE,
  deployBackend,
} from "./manager";
import { SandboxError, type BackendRouteInput } from "./validate";

/** Invokes and deploys share one window per client IP. */
export const SANDBOX_REQUESTS_PER_MINUTE = 60;

export type SandboxRouterOptions = {
  windowMs?: number;
  max?: number;
};

function one(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function routePathFor(originalUrl: string, marker: string): string {
  const pathname = originalUrl.split("?")[0] ?? "/";
  const idx = pathname.indexOf(marker);
  if (idx === -1) return "/";
  let rest = pathname.slice(idx + marker.length);
  if (!rest || rest === "/") return "/";
  if (!rest.startsWith("/")) rest = `/${rest}`;
  if (rest.length > 1 && rest.endsWith("/")) rest = rest.slice(0, -1);
  return rest;
}

function queryRecord(query: Request["query"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value) && typeof value[0] === "string") out[key] = value[0];
  }
  return out;
}

function forwardHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (key === "host" || key === "cookie") continue;
    if (typeof value === "string") headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(", ");
  }
  return headers;
}

function sendError(res: Response, error: unknown, fallback: string): void {
  const message = error instanceof Error && error.message ? error.message : fallback;
  const status = error instanceof SandboxError ? error.status : 500;
  if (status >= 500) console.error("[sandbox]", message);
  if (!res.headersSent) res.status(status).json({ error: message });
}

async function proxy(req: Request, res: Response, sessionId: string, routePath: string): Promise<void> {
  const result = await invokeSandbox({
    sessionId,
    method: req.method,
    routePath,
    query: queryRecord(req.query),
    headers: forwardHeaders(req),
    body: req.method === "GET" || req.method === "HEAD" ? null : (req.body ?? null),
  });

  res.status(result.status);
  for (const [key, value] of Object.entries(result.headers)) {
    res.setHeader(key, value);
  }
  const contentType = result.headers["content-type"] || "";
  if (contentType.includes("application/json") || (typeof result.body === "object" && result.body !== null)) {
    res.json(result.body ?? null);
    return;
  }
  res.send(result.body == null ? "" : String(result.body));
}

/**
 * Sandboxed Node backends.
 * Mount at `/api`: `POST /api/sandbox/deploy`, `/api/u/:sessionId/*`, `/api/p/:slug/*`.
 * Published slugs proxy the session `published_<slug>` (no HTML renderer).
 */
export function createSandboxRouter(options: SandboxRouterOptions = {}): Router {
  const router = Router();
  router.use(
    createRateLimiter({
      windowMs: options.windowMs ?? 60_000,
      max: options.max ?? SANDBOX_REQUESTS_PER_MINUTE,
    }),
  );

  router.post("/sandbox/deploy", async (req, res) => {
    try {
      const body = (req.body ?? {}) as { sessionId?: unknown; routes?: unknown };
      if (typeof body.sessionId !== "string" || !Array.isArray(body.routes)) {
        res.status(400).json({ error: "sessionId and routes are required" });
        return;
      }
      const sandbox = await deployBackend({
        sessionId: body.sessionId,
        routes: body.routes as BackendRouteInput[],
      });
      res.json(sandbox);
    } catch (error) {
      sendError(res, error, "Deploy failed");
    }
  });

  router.use("/u/:sessionId", async (req, res) => {
    try {
      const sessionId = one(req.params.sessionId);
      if (!SESSION_ID_RE.test(sessionId)) {
        res.status(400).json({ error: "Invalid session id" });
        return;
      }
      await proxy(req, res, sessionId, routePathFor(req.originalUrl, `/u/${sessionId}`));
    } catch (error) {
      sendError(res, error, "Sandbox error");
    }
  });

  router.use("/p/:slug", async (req, res) => {
    try {
      const slug = one(req.params.slug);
      const sessionId = publishedSandboxId(slug);
      if (!sandboxExists(sessionId)) {
        res.status(404).json({ error: "Site not found" });
        return;
      }
      await proxy(req, res, sessionId, routePathFor(req.originalUrl, `/p/${slug}`));
    } catch (error) {
      sendError(res, error, "Sandbox error");
    }
  });

  return router;
}

export const sandboxRouter = createSandboxRouter();
