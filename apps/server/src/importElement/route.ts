import express, { Router } from "express";
import { z } from "zod";
import { findNode, type Screen } from "@create/shared";
import { createPrototypeStore, type PrototypeStore } from "../store/prototypes";
import { createRateLimiter } from "../middleware/rateLimit";
import { editNodeWithFallback } from "../ai/claude";
import { MAX_DEPTH, MAX_NODES, MAX_TEXT, domToScreen, measure, type SnapshotNode } from "./convert";

const StyleSnap = z
  .object({
    fontSize: z.string().max(30),
    fontWeight: z.string().max(30),
    color: z.string().max(80),
    backgroundColor: z.string().max(80),
    textAlign: z.string().max(30),
    display: z.string().max(30),
    flexDirection: z.string().max(30),
  })
  .partial();

const SnapNode: z.ZodType<SnapshotNode> = z.lazy(() =>
  z.object({
    tag: z.string().min(1).max(30),
    text: z.string().max(MAX_TEXT * 4).optional(),
    src: z.string().max(2000).optional(),
    alt: z.string().max(500).optional(),
    href: z.string().max(2000).optional(),
    style: StyleSnap.optional(),
    children: z.array(SnapNode).max(MAX_NODES).optional(),
  }),
);

export const ImportElementRequestSchema = z.object({
  snapshot: z.object({
    title: z.string().max(300).optional(),
    url: z.string().max(2000).optional(),
    root: SnapNode,
  }),
  instruction: z.string().max(1000).optional(),
  sourceUrl: z.string().max(2000).optional(),
});

const FALLBACK_ORIGIN = "http://localhost:5175";

/** Applies the instruction to the converted root (real model when configured, else the mock edit). */
async function applyInstruction(screen: Screen, instruction: string): Promise<Screen> {
  const target = screen.children[0];
  if (!target) return screen;
  try {
    const out = await editNodeWithFallback({ prompt: instruction, screen, nodeId: target.id });
    if (!findNode(screen, target.id)) return screen;
    return { ...screen, children: out.nodes.length ? [...out.nodes, ...screen.children.slice(1)] : screen.children };
  } catch (err) {
    console.warn("[import-element] instruction skipped:", err instanceof Error ? err.message : "unknown");
    return screen;
  }
}

/** POST /api/import-element { snapshot, instruction?, sourceUrl? } -> { id, url }. Mount with app.use("/api", importElementRouter). */
export function createImportElementRouter(store: PrototypeStore = createPrototypeStore()): Router {
  const router = Router();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });
  router.post("/import-element", limiter, express.json({ limit: "1mb" }), async (req, res, next) => {
    try {
      const parsed = ImportElementRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid snapshot." });
        return;
      }
      const { snapshot, instruction } = parsed.data;
      const m = measure(snapshot.root);
      if (m.nodes > MAX_NODES || m.depth > MAX_DEPTH) {
        res.status(400).json({ error: `Snapshot too large (max ${MAX_NODES} nodes, depth ${MAX_DEPTH}).` });
        return;
      }
      let screen: Screen;
      try {
        screen = domToScreen(snapshot);
      } catch {
        res.status(422).json({ error: "Could not convert that element." });
        return;
      }
      if (instruction?.trim()) screen = await applyInstruction(screen, instruction.trim());
      let saved;
      try {
        saved = await store.save({ title: screen.title, screen });
      } catch (err) {
        console.error("[import-element] save failed:", err);
        res.status(500).json({ error: "Could not save prototype." });
        return;
      }
      const origin = (process.env.PUBLIC_URL?.trim() || req.headers.origin || FALLBACK_ORIGIN).replace(/\/+$/, "");
      // Extension origins are chrome-extension://; never build a link on them.
      const base = /^https?:\/\//.test(origin) ? origin : FALLBACK_ORIGIN;
      res.json({ id: saved.id, url: `${base}/?p=${saved.id}` });
    } catch (err) {
      next(err);
    }
  });
  return router;
}

export const importElementRouter = createImportElementRouter();
