import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import { authRequired } from "../auth";
import { bigJson } from "../middleware/bodyLimit";
import { defaultCounter, type Counter } from "./counter";
import { BUCKETS, ROUTE_BUCKETS, adminEmails, dayWindow, ipLimitFor, limitFor, type Bucket, type Subject } from "./limits";

export type QuotaOptions = {
  counter?: Counter;
  now?: () => number;
  /** Force quotas on or off. Default: on unless MOCK_AI=1 (mock calls cost nothing); DEMO_QUOTAS=1 turns them on anyway. */
  enabled?: () => boolean;
};

function defaultEnabled(): boolean {
  return process.env.DEMO_QUOTAS === "1" || process.env.MOCK_AI !== "1";
}

export function subjectOf(req: Request): Subject {
  const s = req.session;
  if (!s) return { kind: "anonymous", id: `ip:${req.ip ?? "unknown"}`, admin: false };
  const admin = s.kind === "account" && Boolean(s.email) && adminEmails().includes(s.email!.toLowerCase());
  return { kind: s.kind, id: `${s.kind}:${s.sub}`, admin };
}

export function createQuota(opts: QuotaOptions = {}) {
  const counter = opts.counter ?? defaultCounter();
  const now = opts.now ?? Date.now;
  const enabled = opts.enabled ?? defaultEnabled;

  const keyOf = (scope: string, day: string, bucket: Bucket) => `${scope}|${day}|${bucket}`;

  async function usage(req: Request) {
    const subj = subjectOf(req);
    const { day, resetAt } = dayWindow(now());
    const buckets: Record<string, { limit: number; used: number; remaining: number }> = {};
    for (const b of BUCKETS) {
      const limit = limitFor(subj.kind, b);
      const used = await counter.peek(keyOf(subj.id, day, b));
      buckets[b] = { limit, used, remaining: Math.max(0, limit - used) };
    }
    return { kind: subj.kind, admin: subj.admin, enforced: enforced(subj), resetAt, buckets };
  }

  /** Signed-in users are always limited; anonymous callers only when the demo requires accounts or DEMO_QUOTAS=1. */
  function enforced(subj: Subject): boolean {
    if (!enabled() || subj.admin) return false;
    return subj.kind !== "anonymous" || authRequired() || process.env.DEMO_QUOTAS === "1";
  }

  const locateParser = bigJson("That capture is too large. Send a smaller screenshot.");

  async function check(req: Request, res: Response, next: NextFunction, bucket: Bucket): Promise<void> {
    try {
      const subj = subjectOf(req);
      if (authRequired() && subj.kind === "anonymous" && enabled()) {
        res.status(401).json({ error: "Sign in to continue.", code: "auth_required" });
        return;
      }
      if (!enforced(subj)) return next();
      const t = now();
      const { day, resetAt } = dayWindow(t);
      const expiresAt = Date.parse(resetAt);
      // Per-IP first (shared across identities), then the per-user bucket.
      const ip = await counter.take(keyOf(`ip:${req.ip ?? "unknown"}`, day, bucket), ipLimitFor(bucket), expiresAt);
      if (ip.ok && subj.kind !== "anonymous") {
        const u = await counter.take(keyOf(subj.id, day, bucket), limitFor(subj.kind, bucket), expiresAt);
        if (!u.ok) return void res.status(429).json({ error: "Demo limit reached", bucket, resetAt });
      } else if (!ip.ok) {
        return void res.status(429).json({ error: "Demo limit reached", bucket, resetAt });
      }
      next();
    } catch (err) {
      next(err);
    }
  }

  /** Mount on /api before the cost routers. Only POSTs to the cost routes are touched. */
  const gate: RequestHandler = (req, res, next) => {
    if (req.method !== "POST") return next();
    const bucket = ROUTE_BUCKETS[req.path];
    if (!bucket) return next();
    if (req.path === "/locate") {
      // Only the commit pass spends vendor money; read the body (the route's parser then reuses it).
      locateParser(req, res, (err?: unknown) => {
        if (err) return next(err);
        if ((req.body as { mode?: unknown } | undefined)?.mode !== "commit") return next();
        void check(req, res, next, bucket);
      });
      return;
    }
    void check(req, res, next, bucket);
  };

  const router = Router();
  router.get("/usage", async (req, res, next) => {
    try {
      res.json(await usage(req));
    } catch (err) {
      next(err);
    }
  });

  return { gate, router, usage };
}
