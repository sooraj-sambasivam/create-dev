import express, { Router } from "express";
import { FormSubmissionSchema } from "@create/shared";
import { createRateLimiter } from "../middleware/rateLimit";
import { createFormStore, isValidAppId, type FormStore } from "./store";

/** Submissions are small; anything past this is rejected by the body parser with 413. */
export const FORM_BODY_LIMIT = "64kb";
export const FORM_SUBMIT_PER_MINUTE = 30;

/** POST /api/forms/:appId stores a submission, GET lists them newest first. Mount with app.use("/api", formsRouter). */
export function createFormsRouter(store: FormStore = createFormStore()): Router {
  const router = Router();
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

  router.get("/forms/:appId", async (req, res, next) => {
    try {
      const appId = req.params.appId;
      if (!isValidAppId(appId)) {
        res.status(400).json({ error: "Invalid app id." });
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
