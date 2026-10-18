/**
 * Icon name checking and search via Iconify (200k+ open icons, no API key).
 * The model guesses names like "fluent-emoji-flat:shopping-cart"; names that don't exist
 * are replaced with the closest search hit so the page never shows a broken icon.
 */

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Request, Response } from "express";
import { dataDir } from "./runtime";

const API = "https://api.iconify.design";

/** Sets offered to the model and the inspector, grouped by look. */
export const ICON_STYLES: Record<string, string[]> = {
  line: ["lucide", "tabler", "ph"],
  solid: ["mdi", "fa6-solid", "heroicons-solid"],
  cartoon: ["fluent-emoji-flat", "flat-color-icons", "noto"],
  "3d": ["fluent-emoji"],
  brand: ["logos", "simple-icons"],
};
const FALLBACK_PREFIXES = ["lucide", "tabler", "mdi", "fluent-emoji-flat"];

const exists = new Map<string, boolean>();
const corrected = new Map<string, string | null>();

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Check many names at once (one request per icon set). */
async function checkNames(names: string[]): Promise<void> {
  const byPrefix = new Map<string, string[]>();
  for (const full of names) {
    if (exists.has(full)) continue;
    const [prefix, name] = full.split(":");
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
  }
  await Promise.all(
    [...byPrefix].map(async ([prefix, list]) => {
      const data = await getJson<{ icons?: Record<string, unknown>; aliases?: Record<string, unknown>; not_found?: string[] }>(
        `${API}/${prefix}.json?icons=${list.map(encodeURIComponent).join(",")}`,
      );
      for (const n of list) {
        const ok = Boolean(data && (data.icons?.[n] || data.aliases?.[n]));
        // If Iconify itself is unreachable, assume the name is fine rather than rewriting everything.
        exists.set(`${prefix}:${n}`, data === null ? true : ok);
      }
    }),
  );
}

export async function searchIcons(query: string, prefixes: string[], limit = 32): Promise<string[]> {
  const url = `${API}/search?query=${encodeURIComponent(query)}&limit=${limit}${prefixes.length ? `&prefixes=${prefixes.join(",")}` : ""}`;
  const data = await getJson<{ icons?: string[] }>(url);
  return data?.icons ?? [];
}

/** How well an icon name matches the guessed words: exact word hits count fully, partial ones a little. */
function score(candidate: string, words: string[]): number {
  const tokens = candidate.split(":")[1]?.split("-") ?? [];
  // "tik-tok" should match "tiktok".
  if (words.length > 1 && tokens.join("") === words.join("")) return words.length;
  let total = 0;
  for (const w of words) {
    if (tokens.includes(w)) total += 1;
    else if (tokens.some((t) => t.startsWith(w) || w.startsWith(t))) total += 0.3;
  }
  return total - Math.max(0, tokens.length - words.length) * 0.1;
}

async function correct(full: string): Promise<string | null> {
  if (corrected.has(full)) return corrected.get(full)!;
  const [prefix, name] = full.split(":");
  const words = name.split("-").filter((w) => w.length > 2);
  const queries = [...new Set([words.join(" "), words.join(""), ...words])];
  const group = Object.values(ICON_STYLES).find((sets) => sets.includes(prefix)) ?? [];
  // Same set first, then another set with the same look (e.g. cartoon), then any common set.
  const prefixLists = [[prefix], group.filter((p) => p !== prefix), FALLBACK_PREFIXES].filter((l) => l.length > 0);
  let result: string | null = null;
  for (const prefixes of prefixLists) {
    const found = (await Promise.all(queries.map((q) => searchIcons(q, prefixes, 24)))).flat();
    let best: { name: string; score: number } | null = null;
    for (const cand of new Set(found)) {
      const sc = score(cand, words);
      if (sc > 0.5 && (!best || sc > best.score)) best = { name: cand, score: sc };
    }
    if (best) {
      result = best.name;
      break;
    }
  }
  corrected.set(full, result);
  return result;
}

/** Returns a map from each given name to a name that exists (or null if nothing matched). */
export async function resolveIconNames(names: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(names)];
  await checkNames(unique);
  const out = new Map<string, string | null>();
  await Promise.all(
    unique.map(async (n) => {
      out.set(n, exists.get(n) ? n : await correct(n));
    }),
  );
  return out;
}

// ---------------------------------------------------------------- single icon SVG proxy

/** Icon names look like "lucide:heart". Anything else is refused before it reaches the disk or the network. */
export const ICON_NAME = /^[a-z0-9-]+:[a-z0-9-]+$/i;
export const ICON_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 5000;
/** Lives beside images.ts's cache, in the same gitignored .cache folder. */
export const DEFAULT_ICON_CACHE = join(dataDir("cache"), "icons");

export type IconSvg = { kind: "found"; svg: string } | { kind: "missing" } | { kind: "unavailable" };

interface Upstream {
  kind: "found" | "missing";
  svg?: string;
}

/** Iconify answers unknown icons with a 404, or sometimes a 200 whose body is just "404". */
async function fetchUpstream(set: string, icon: string): Promise<Upstream | null> {
  try {
    const res = await fetch(`${API}/${set}/${icon}.svg`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (res.status === 404) return { kind: "missing" };
    if (!res.ok) return null;
    const body = await res.text();
    const text = body.trim();
    if (text === "404") return { kind: "missing" };
    if (!/<svg[\s>]/i.test(text)) return null;
    return { kind: "found", svg: body };
  } catch {
    return null;
  }
}

function isFresh(file: string): boolean {
  try {
    return Date.now() - statSync(file).mtimeMs < ICON_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function readSvg(file: string): IconSvg | null {
  try {
    return { kind: "found", svg: readFileSync(file, "utf8") };
  } catch {
    return null;
  }
}

/** Best-effort disk writes: a full or read-only disk should not fail the request. */
function tryWrite(file: string, contents: string) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  } catch (err) {
    console.error("[icons] could not save cache", err);
  }
}

function tryRemove(file: string) {
  try {
    if (existsSync(file)) unlinkSync(file);
  } catch {
    // Nothing to tidy up.
  }
}

/**
 * Cache layout: <cacheDir>/<set>/<icon>.svg for icons that exist, and <icon>.404 (empty) for
 * names Iconify does not have. A file is fresh for 24 h by its mtime. When Iconify is unreachable,
 * an old entry is still better than an error, so it is served as a fallback.
 */
async function loadIconSvg(set: string, icon: string, cacheDir: string): Promise<IconSvg> {
  const dir = join(cacheDir, set);
  const svgFile = join(dir, `${icon}.svg`);
  const missFile = join(dir, `${icon}.404`);

  if (isFresh(svgFile)) {
    const hit = readSvg(svgFile);
    if (hit) return hit;
  }
  if (isFresh(missFile)) return { kind: "missing" };

  const upstream = await fetchUpstream(set, icon);
  if (upstream?.kind === "found" && upstream.svg !== undefined) {
    tryWrite(svgFile, upstream.svg);
    tryRemove(missFile);
    return { kind: "found", svg: upstream.svg };
  }
  if (upstream?.kind === "missing") {
    tryWrite(missFile, "");
    tryRemove(svgFile);
    return { kind: "missing" };
  }

  // Upstream failed: fall back to whatever is cached, however old.
  if (existsSync(svgFile)) {
    const stale = readSvg(svgFile);
    if (stale) return stale;
  }
  if (existsSync(missFile)) return { kind: "missing" };
  return { kind: "unavailable" };
}

const inflight = new Map<string, Promise<IconSvg>>();

/** Resolve "set:icon" to its SVG, a missing marker, or unavailable. Concurrent lookups share one fetch. */
export function getIconSvg(name: string, cacheDir: string = DEFAULT_ICON_CACHE): Promise<IconSvg> {
  if (!ICON_NAME.test(name)) return Promise.resolve({ kind: "missing" });
  const key = `${cacheDir}|${name}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const [set, icon] = name.toLowerCase().split(":");
  const job = loadIconSvg(set, icon, cacheDir).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/**
 * GET /api/icons/svg?name=set:icon -> the icon as image/svg+xml, 404 for an invalid or unknown
 * name, 502 when Iconify cannot be reached and nothing is cached.
 */
export function createIconSvgHandler(cacheDir: string = DEFAULT_ICON_CACHE) {
  return async (req: Request, res: Response) => {
    const name = typeof req.query.name === "string" ? req.query.name : "";
    const result = await getIconSvg(name, cacheDir);
    if (result.kind === "found") {
      res.set({
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        // Served as a document this stays inert; as an <img> or CSS mask it never runs anyway.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      });
      res.send(result.svg);
      return;
    }
    if (result.kind === "missing") {
      res.set("Cache-Control", "public, max-age=3600").status(404).json({ error: "Unknown icon." });
      return;
    }
    res.set("Cache-Control", "no-store").status(502).json({ error: "Icon service unavailable." });
  };
}

export const iconSvgHandler = createIconSvgHandler();
