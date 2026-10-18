import { Router } from "express";
import { isIP } from "node:net";
import { lookup, pick } from "../images";
import { createRateLimiter } from "../middleware/rateLimit";

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

/** Hosts /api/image can redirect to (Openverse and the CDNs it indexes). Suffix entries match subdomains. */
export const IMAGE_BYTES_HOSTS = [
  "openverse.org",
  "wikimedia.org",
  "staticflickr.com",
  "images.unsplash.com",
  "images.pexels.com",
  "cdn.pixabay.com",
];
export const IMAGE_BYTES_MAX = 5 * 1024 * 1024;
const IMAGE_BYTES_TIMEOUT_MS = 8_000;
const IMAGE_BYTES_MAX_REDIRECTS = 3;

export const imageBytesLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

/** True for an https URL whose hostname (not an IP, not localhost) is on the allow-list. */
export function isAllowedImageUrl(u: URL): boolean {
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || isIP(host) !== 0 || host.startsWith("[")) return false;
  return IMAGE_BYTES_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * GET /api/image/bytes?url=<https url> -> the image bytes, same-origin, so the browser can read pictures
 * whose host sends no CORS headers. Allow-listed hosts only (re-checked on every redirect), images only.
 */
imageRouter.get("/image/bytes", imageBytesLimiter, async (req, res) => {
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  let current: URL;
  try {
    current = new URL(raw);
  } catch {
    res.status(400).json({ error: "A valid url is required." });
    return;
  }
  if (!isAllowedImageUrl(current)) {
    res.status(400).json({ error: "Only https images from known photo hosts are allowed." });
    return;
  }
  try {
    const signal = AbortSignal.timeout(IMAGE_BYTES_TIMEOUT_MS);
    let upstream: Response | null = null;
    for (let hop = 0; hop <= IMAGE_BYTES_MAX_REDIRECTS; hop++) {
      const r = await fetch(current, {
        redirect: "manual",
        signal,
        headers: { "User-Agent": "create-dev-hackathon/0.1", Accept: "image/*" },
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        await r.body?.cancel().catch(() => undefined);
        if (!loc || hop === IMAGE_BYTES_MAX_REDIRECTS) {
          res.status(502).json({ error: "Too many redirects." });
          return;
        }
        let next: URL;
        try {
          next = new URL(loc, current);
        } catch {
          res.status(502).json({ error: "Bad redirect." });
          return;
        }
        if (!isAllowedImageUrl(next)) {
          res.status(400).json({ error: "Redirected to a host that is not allowed." });
          return;
        }
        current = next;
        continue;
      }
      upstream = r;
      break;
    }
    if (!upstream || !upstream.ok) {
      await upstream?.body?.cancel().catch(() => undefined);
      res.status(502).json({ error: "Could not fetch the image." });
      return;
    }
    const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/") || type.includes("svg")) {
      await upstream.body?.cancel().catch(() => undefined);
      res.status(415).json({ error: "Only raster images are supported." });
      return;
    }
    const declared = Number(upstream.headers.get("content-length") ?? 0);
    if (declared > IMAGE_BYTES_MAX) {
      await upstream.body?.cancel().catch(() => undefined);
      res.status(413).json({ error: "Image is too large." });
      return;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = upstream.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > IMAGE_BYTES_MAX) {
        await reader.cancel().catch(() => undefined);
        res.status(413).json({ error: "Image is too large." });
        return;
      }
      chunks.push(value);
    }
    res.set("Content-Type", type);
    res.set("Cache-Control", "public, max-age=86400");
    res.set("X-Content-Type-Options", "nosniff");
    res.send(Buffer.concat(chunks));
  } catch {
    if (!res.headersSent) res.status(502).json({ error: "Could not fetch the image." });
  }
});
