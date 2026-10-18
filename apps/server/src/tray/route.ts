import express, { Router } from "express";
import { z } from "zod";
import { createRateLimiter } from "../middleware/rateLimit";
import { trayStore, type TrayStore } from "./store";

export const TrayPostSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.string().trim().min(1).max(40),
  url: z.string().trim().max(2000).regex(/^(https?:\/\/\S+|\/\S*)$/, "url must be http(s) or a path"),
});

/** GET/POST /api/tray, DELETE /api/tray/:id. Mount with app.use("/api", trayRouter) before the global parser. */
export function createTrayRouter(store: TrayStore = trayStore): Router {
  const router = Router();
  const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
  const readLimiter = createRateLimiter({ windowMs: 60_000, max: 240 });
  router.get("/tray", readLimiter, (_req, res) => {
    res.json({ items: store.list() });
  });
  router.post("/tray", writeLimiter, express.json({ limit: "8kb" }), (req, res) => {
    const parsed = TrayPostSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
      return;
    }
    res.status(201).json({ item: store.push(parsed.data) });
  });
  router.delete("/tray/:id", writeLimiter, (req, res) => {
    if (!store.remove(String(req.params.id))) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    res.json({ ok: true });
  });
  return router;
}

export const trayRouter = createTrayRouter();
