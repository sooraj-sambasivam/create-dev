import express, { Router } from "express";
import { FormSubmissionSchema } from "@create/shared";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isAllowedOrigin } from "../middleware/origins";
import { createRateLimiter } from "../middleware/rateLimit";
import { createFormStore, isValidAppId, type FormStore } from "./store";

/** Submissions are small; anything past this is rejected by the body parser with 413. */
export const FORM_BODY_LIMIT = "64kb";
export const FORM_SUBMIT_PER_MINUTE = 30;

export interface FormsRouterOptions {
  /** HMAC secret for owner read tokens. Defaults to FORMS_SECRET, else a random per-process secret (tokens reset on restart). */
  secret?: string;
}

let processSecret: string | undefined;
function defaultSecret(): string {
  const env = process.env.FORMS_SECRET?.trim();
  if (env) return env;
  return (processSecret ??= randomBytes(32).toString("hex"));
}

/** Owner read token for an app: HMAC-SHA256(secret, appId), url-safe. */
export function formsToken(appId: string, secret: string): string {
  return createHmac("sha256", secret).update(`forms:${appId}`).digest("base64url");
}

function tokenMatches(given: unknown, expected: string): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/forms/:appId stores a submission (public). Reading is owner-only:
 *  - POST /api/forms/:appId/token returns the owner token, but only to a request whose Origin is an allowed origin
 *    (the web app). This is a browser-level gate: a non-browser client can forge Origin, so treat it as demo-grade.
 *  - GET /api/forms/:appId?key=<token> (or Authorization: Bearer <token>) lists submissions; otherwise 401.
 */
export function createFormsRouter(store: FormStore = createFormStore(), options: FormsRouterOptions = {}): Router {
  const router = Router();
  const secret = () => options.secret ?? defaultSecret();
  const tokenLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
  const limiter = createRateLimiter({ windowMs: 60_000, max: FORM_SUBMIT_PER_MINUTE });

  router.post("/forms/:appId", limiter, express.json({ limit: FORM_BODY_LIMIT }), async (req, res, next) => {
    try {
      const appId = req.params.appId;
      if (!isValidAppId(appId)) {
        res.status(400).json({ error: "Invalid app id." });
        return;
      }
      const parsed = FormSubmissionSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid submission." });
        return;
      }
      try {
        res.json(await store.add(appId, parsed.data));
      } catch (err) {
        console.error("[forms] save failed:", err);
        res.status(500).json({ error: "Could not save submission." });
      }
    } catch (err) {
      next(err);
    }
  });

  router.post("/forms/:appId/token", tokenLimiter, (req, res) => {
    const appId = req.params.appId;
    if (!isValidAppId(appId)) {
      res.status(400).json({ error: "Invalid app id." });
      return;
    }
    const origin = req.headers.origin;
    if (!origin || !isAllowedOrigin(origin, req.originalUrl ?? req.url ?? "")) {
      res.status(401).json({ error: "Not allowed." });
      return;
    }
    res.json({ token: formsToken(appId, secret()) });
  });

  router.get("/forms/:appId", async (req, res, next) => {
    try {
      const appId = req.params.appId;
      if (!isValidAppId(appId)) {
        res.status(400).json({ error: "Invalid app id." });
        return;
      }
      const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!tokenMatches(req.query.key ?? bearer, formsToken(appId, secret()))) {
        res.status(401).json({ error: "A valid key is required to read submissions." });
        return;
      }
      try {
        res.json(await store.list(appId));
      } catch (err) {
        console.error("[forms] load failed:", err);
        res.status(500).json({ error: "Could not load submissions." });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const formsRouter = createFormsRouter();
