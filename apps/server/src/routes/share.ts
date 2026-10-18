import express, { Router } from "express";
import { SharePrototypeRequestSchema, type SharedPrototype, type SharePrototypeResponse } from "@create/shared";
import { createPrototypeStore, isValidPrototypeId, type PrototypeStore } from "../store/prototypes";
import { createRateLimiter } from "../middleware/rateLimit";

const FALLBACK_ORIGIN = "http://localhost:5173";

/** Local JSON-file store cap. Past this many prototypes, creating another returns 507. */
export const MAX_FILE_PROTOTYPES = 2000;

/** Creating a share link is capped per client IP, per minute. */
export const SHARE_CREATE_PER_MINUTE = 20;

/**
 * A store may expose count() to enforce the file cap. The local FileStore is the only one that
 * needs it; MongoStore is not capped here.
 */
type CountableStore = PrototypeStore & { count?: () => Promise<number> };

/** Logs which backing store is active. Only the kind is logged, never the URI. */
export function describeStoreChoice(env: NodeJS.ProcessEnv = process.env): string {
  return env.MONGODB_URI?.trim()
    ? "[share] prototype store: MongoDB (MONGODB_URI set; connects on first use)"
    : "[share] prototype store: local JSON files (MONGODB_URI not set)";
}

/**
 * Origin used to build the share link: PUBLIC_URL first (a phone cannot open the localhost origin the
 * desktop browser sends), then the caller's origin, then the dev client.
 */
export function shareOrigin(originHeader: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.PUBLIC_URL?.trim() || originHeader || FALLBACK_ORIGIN;
  return raw.replace(/\/+$/, "");
}

/**
 * Store failures (Mongo connection or auth errors, fs errors with absolute paths) are logged here and
 * replaced with a generic message, so anonymous callers never see cluster hosts or server paths.
 */
function logStoreFailure(op: string, err: unknown): void {
  console.error(`[share] ${op} failed:`, err);
}

/**
 * Prototype sharing routes. Mount with `app.use("/api", shareRouter)`.
 * Note: the global express.json limit in index.ts runs first; a body over that limit is rejected
 * before this router sees it, so the global limit must be at least 5mb (or this router mounted before it).
 */
export function createShareRouter(store: PrototypeStore = createPrototypeStore()): Router {
  const router = Router();
  const createLimiter = createRateLimiter({ windowMs: 60_000, max: SHARE_CREATE_PER_MINUTE });

  /** POST /api/prototypes  { screen, title? } -> { id, url } */
  router.post("/prototypes", createLimiter, express.json({ limit: "5mb" }), async (req, res, next) => {
    try {
      const parsed = SharePrototypeRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid prototype." });
        return;
      }
      const { screen, title } = parsed.data;
      const countable = store as CountableStore;
      if (countable.count) {
        let stored: number;
        try {
          stored = await countable.count();
        } catch (err) {
          logStoreFailure("count", err);
          res.status(500).json({ error: "Could not save prototype." });
          return;
        }
        if (stored >= MAX_FILE_PROTOTYPES) {
          res.status(507).json({ error: "Prototype storage is full. Remove old prototypes before sharing more." });
          return;
        }
      }
      let saved: SharedPrototype;
      try {
        saved = await store.save({ title: title?.trim() || screen.title, screen });
      } catch (err) {
        logStoreFailure("save", err);
        res.status(500).json({ error: "Could not save prototype." });
        return;
      }
      const body: SharePrototypeResponse = {
        id: saved.id,
        url: `${shareOrigin(req.headers.origin)}/?p=${saved.id}`,
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  /** GET /api/prototypes/:id -> SharedPrototype, 400 for a malformed id, 404 when missing. */
  router.get("/prototypes/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      if (!isValidPrototypeId(id)) {
        res.status(400).json({ error: "Invalid prototype id." });
        return;
      }
      let found: SharedPrototype | null;
      try {
        found = await store.get(id);
      } catch (err) {
        logStoreFailure("load", err);
        res.status(500).json({ error: "Could not load prototype." });
        return;
      }
      if (!found) {
        res.status(404).json({ error: "Prototype not found." });
        return;
      }
      res.json(found);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

const activeStore = createPrototypeStore();
console.log(describeStoreChoice());
export const shareRouter = createShareRouter(activeStore);
