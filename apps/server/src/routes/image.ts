import { Router } from "express";
import { lookup, pick } from "../images";

export const imageRouter = Router();

/**
 * GET /api/image?q=latte+art&seed=hero-image -> 302 to a matching photo, or 404 when nothing
 * relevant exists (the page then shows an honest "no photo found" placeholder).
 */
imageRouter.get("/image", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const seed = typeof req.query.seed === "string" ? req.query.seed.slice(0, 120) : q;
  const url = pick(await lookup(q), seed);
  if (!url) {
    res.status(404).json({ error: "No matching photo." });
    return;
  }
  res.set("Cache-Control", "private, max-age=3600");
  res.redirect(302, url);
});

/** GET /api/image/resolve?q=…&seed=… -> { url } for exporting a page with real photo links. */
imageRouter.get("/image/resolve", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const seed = typeof req.query.seed === "string" ? req.query.seed.slice(0, 120) : q;
  res.json({ url: pick(await lookup(q), seed) });
});
