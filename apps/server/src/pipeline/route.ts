import express, { Router } from "express";
import { z } from "zod";
import { LocateRequestSchema, StageTimingSchema } from "@create/shared";
import { bigJson } from "../middleware/bodyLimit";
import { createRateLimiter } from "../middleware/rateLimit";
import { locate } from "./locate";
import { readTraces, writeClientTrace } from "./trace";

/** POST /api/locate, GET and POST /api/traces (dev only). Mount before the global JSON parser. */
export const locateRouter = Router();
const limiter = createRateLimiter({ windowMs: 60_000, max: 120 });

locateRouter.post("/locate", limiter, bigJson("That capture is too large. Send a smaller screenshot."), async (req, res) => {
  const parsed = LocateRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
    return;
  }
  try {
    res.json(await locate(parsed.data.input, parsed.data.providers, { mode: parsed.data.mode }));
  } catch (err) {
    console.error("[locate] unexpected", err instanceof Error ? err.message : "unknown");
    res.status(500).json({ error: "Could not locate that. Which one?" });
  }
});

locateRouter.get("/traces", async (req, res) => {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const n = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(n) ? Math.min(500, Math.max(1, Math.floor(n))) : 50;
  res.json({ traces: await readTraces(limit) });
});

const ClientTraceSchema = z.object({
  source: z.string().max(40).default("client"),
  traceId: z.string().max(80).optional(),
  stages: z.array(StageTimingSchema).min(1).max(100),
});

/** Clients (extension, web) report their own stage timings here. 204 on success; 404 in production. */
locateRouter.post("/traces", express.json({ limit: "64kb" }), async (req, res) => {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const parsed = ClientTraceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
    return;
  }
  await writeClientTrace(parsed.data);
  res.status(204).end();
});
