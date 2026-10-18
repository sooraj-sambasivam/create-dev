import express, { Router } from "express";
import { LiftRequestSchema, type LiftResponse } from "@create/shared";
import { createPrototypeStore, type PrototypeStore } from "../store/prototypes";
import { createRateLimiter } from "../middleware/rateLimit";
import { DEFAULT_FORM_ID, entityToScreen } from "./entityToScreen";
import { polishCopy } from "./polish";

const FALLBACK_ORIGIN = "http://localhost:5173";

/** POST /api/lift { entity, instruction? } -> { id, url, formId, provider }. Mount with app.use("/api", liftRouter). */
export function createLiftRouter(store: PrototypeStore = createPrototypeStore()): Router {
  const router = Router();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });
  router.post("/lift", limiter, express.json({ limit: "1mb" }), async (req, res, next) => {
    try {
      const parsed = LiftRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
        return;
      }
      const { entity, instruction } = parsed.data;
      const formId = DEFAULT_FORM_ID;
      const { copy, provider } = await polishCopy(entity, instruction);
      const screen = entityToScreen(entity, formId, copy);
      let saved;
      try {
        saved = await store.save({ title: screen.title, screen });
      } catch (err) {
        console.error("[lift] save failed:", err);
        res.status(500).json({ error: "Could not save that." });
        return;
      }
      const origin = (process.env.PUBLIC_URL?.trim() || req.headers.origin || FALLBACK_ORIGIN).replace(/\/+$/, "");
      const base = /^https?:\/\//.test(origin) ? origin : FALLBACK_ORIGIN;
      const body: LiftResponse = { id: saved.id, url: `${base}/?p=${saved.id}`, formId, provider };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });
  return router;
}

export const liftRouter = createLiftRouter();
