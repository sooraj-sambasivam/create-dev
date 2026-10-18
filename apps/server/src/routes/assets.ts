import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router } from "express";
import multer from "multer";
import type { Asset } from "@create/shared";
import { ICON_STYLES, iconSvgHandler, searchIcons } from "../icons";

export const assetsRouter = Router();

const UPLOAD_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".cache", "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

// SVG is excluded on purpose: it can carry scripts.
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

/** POST /api/upload (multipart "file") -> { url, name } for the user's own logo or photos. */
assetsRouter.post("/upload", upload.single("file"), (req, res) => {
  const file = req.file;
  const ext = file ? TYPES[file.mimetype] : undefined;
  if (!file || !ext) {
    res.status(400).json({ error: "Upload a PNG, JPG, WebP or GIF image (max 8 MB)." });
    return;
  }
  const name = `${randomBytes(8).toString("hex")}.${ext}`;
  writeFileSync(join(UPLOAD_DIR, name), file.buffer);
  const body: Asset = { url: `/api/uploads/${name}`, name: file.originalname.slice(0, 200) };
  res.json(body);
});

assetsRouter.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    fallthrough: false,
    maxAge: "1d",
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  }),
);

/** GET /api/icons/svg?name=set:icon -> one icon as SVG (proxied from Iconify, cached 24 h). */
assetsRouter.get("/icons/svg", iconSvgHandler);

/** GET /api/icons/search?q=cart&style=cartoon -> { icons: ["fluent-emoji-flat:shopping-cart", …] } */
assetsRouter.get("/icons/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
  const style = typeof req.query.style === "string" ? req.query.style : "";
  if (!q) {
    res.json({ icons: [] });
    return;
  }
  const prefixes = ICON_STYLES[style] ?? [];
  res.json({ icons: await searchIcons(q, prefixes, 48) });
});
