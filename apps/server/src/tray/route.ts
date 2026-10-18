import express, { Router } from "express";
import { z } from "zod";
import { TraySourceSchema, TrayStylesSchema, TrayThumbnailSchema, TRAY_HTML_MAX } from "@create/shared";
import { createRateLimiter } from "../middleware/rateLimit";
import { createPrototypeStore, type PrototypeStore } from "../store/prototypes";
import { MAX_DEPTH, MAX_NODES, domToScreen, measure } from "../importElement/convert";
import { trayStore, type TrayStore } from "./store";
import { sanitizeSnippetHtml, snippetToSnapshot } from "./snippet";

export const TRAY_BODY_LIMIT = "256kb";

export const TrayPostSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.string().trim().min(1).max(40),
  url: z.string().trim().max(2000).regex(/^(https?:\/\/\S+|\/\S*)$/, "url must be http(s) or a path").optional(),
  thumbnail: TrayThumbnailSchema.optional(),
  snippetHtml: z.string().max(TRAY_HTML_MAX * 4).optional(),
  styles: TrayStylesSchema.optional(),
  source: TraySourceSchema.optional(),
});

const FALLBACK_ORIGIN = "http://localhost:5175";

/**
 * GET/POST /api/tray, DELETE /api/tray/:id, GET /api/tray/:id/thumbnail|snippet, POST /api/tray/:id/open.
 * Mount with app.use("/api", trayRouter) before the global parser.
 */
export function createTrayRouter(store: TrayStore = trayStore, protos: () => PrototypeStore = () => defaultProtos()): Router {
  const router = Router();
  const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
  const readLimiter = createRateLimiter({ windowMs: 60_000, max: 240 });
  router.get("/tray", readLimiter, (_req, res) => {
    res.json({ items: store.list() });
  });
  router.post("/tray", writeLimiter, express.json({ limit: TRAY_BODY_LIMIT }), (req, res) => {
    const parsed = TrayPostSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
      return;
    }
    const { snippetHtml, ...rest } = parsed.data;
    const clean = snippetHtml === undefined ? "" : sanitizeSnippetHtml(snippetHtml);
    if (snippetHtml !== undefined && !clean && !rest.thumbnail && !rest.url) {
      res.status(400).json({ error: "Invalid request: snippet has nothing safe to keep" });
      return;
    }
    res.status(201).json({ item: store.push({ ...rest, ...(clean ? { snippetHtml: clean } : {}) }) });
  });
  router.get("/tray/:id/thumbnail", readLimiter, (req, res) => {
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(store.get(String(req.params.id))?.thumbnail ?? "");
    if (!m) { res.status(404).json({ error: "Not found." }); return; }
    res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
    res.send(Buffer.from(m[1]!, "base64"));
  });
  router.get("/tray/:id/snippet", readLimiter, (req, res) => {
    const r = store.get(String(req.params.id));
    if (!r?.snippetHtml) { res.status(404).json({ error: "Not found." }); return; }
    res.json({ html: r.snippetHtml, styles: r.styles ?? {}, title: r.title, source: r.source ?? null });
  });
  // Opens a snippet as a page: the stored markup becomes a snapshot, converted like /api/import-element.
  router.post("/tray/:id/open", writeLimiter, async (req, res, next) => {
    try {
      const r = store.get(String(req.params.id));
      if (!r) { res.status(404).json({ error: "Not found." }); return; }
      if (r.url) { res.json({ url: r.url }); return; }
      if (!r.snippetHtml) { res.status(422).json({ error: "Nothing to open." }); return; }
      const snap = snippetToSnapshot(r.snippetHtml, r.styles, r.title, r.source?.url);
      const m = measure(snap.root);
      if (m.nodes > MAX_NODES * 5 || m.depth > MAX_DEPTH * 8) { res.status(400).json({ error: "Snippet too large to open." }); return; }
      const screen = domToScreen(snap);
      const saved = await protos().save({ title: screen.title, screen });
      const origin = (process.env.PUBLIC_URL?.trim() || req.headers.origin || FALLBACK_ORIGIN).replace(/\/+$/, "");
      const base = /^https?:\/\//.test(origin) ? origin : FALLBACK_ORIGIN;
      res.json({ id: saved.id, url: `${base}/?p=${saved.id}` });
    } catch (err) {
      next(err);
    }
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

let protoSingleton: PrototypeStore | undefined;
const defaultProtos = () => (protoSingleton ??= createPrototypeStore());

export const trayRouter = createTrayRouter();
