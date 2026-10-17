import express, { Router } from "express";
import { DemoRequestSchema, type DemoChunk } from "@create/shared";
import { runDemo } from "../demo/run";

export const demoRouter = Router();

// A narration carries canvas snapshots, so this path takes up to 25mb (the app-wide limit is lower).
demoRouter.post("/demo", express.json({ limit: "25mb" }), async (req, res) => {
  const parsed = DemoRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;
  const abort = new AbortController();
  res.on("close", () => {
    closed = true;
    abort.abort();
  });

  const emit = (chunk: DemoChunk) => {
    if (closed) return;
    res.write(`${JSON.stringify(chunk)}\n`);
    (res as unknown as { flush?: () => void }).flush?.();
  };

  await runDemo(parsed.data, emit, { isAborted: () => closed, signal: abort.signal });
  if (!closed) res.end();
});
