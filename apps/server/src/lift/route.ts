import express, { Router } from "express";
import { LiftRequestSchema, type LiftResponse } from "@create/shared";
import { createPrototypeStore, type PrototypeStore } from "../store/prototypes";
import { createRateLimiter } from "../middleware/rateLimit";
import { DEFAULT_FORM_ID, entityToScreen } from "./entityToScreen";
import { cleanEntity } from "./clean";
import { polishCopy } from "./polish";
import { trayStore, type TrayStore } from "../tray/store";

/** Drops rows identical to an earlier one (compared on trimmed values), keeping first-seen order. */
export function dedupeRows<T extends Record<string, string>>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = JSON.stringify(Object.keys(r).sort().map((k) => [k, (r[k] ?? "").trim()]));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const FALLBACK_ORIGIN = "http://localhost:5173";

/** POST /api/lift { entity, instruction? } -> { id, url, formId, provider }. Mount with app.use("/api", liftRouter). */
export function createLiftRouter(store: PrototypeStore = createPrototypeStore(), tray: TrayStore = trayStore): Router {
  const router = Router();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });
  router.post("/lift", limiter, express.json({ limit: "1mb" }), async (req, res, next) => {
    try {
      const parsed = LiftRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
        return;
      }
      const { instruction } = parsed.data;
      const entity = { ...parsed.data.entity, rows: dedupeRows(parsed.data.entity.rows) };
      const formId = DEFAULT_FORM_ID;
      const { copy, provider } = await polishCopy(cleanEntity(entity), instruction);
      const screen = entityToScreen(entity, formId, copy, instruction);
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
      const url = `${base}/?p=${saved.id}`;
      tray.push({ title: screen.title.slice(0, 200) || entity.title.slice(0, 200) || "Untitled app", kind: entity.kind, url });
      const body: LiftResponse = { id: saved.id, url, formId, provider };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });
  return router;
}

export const liftRouter = createLiftRouter();
