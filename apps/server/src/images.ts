import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Finds relevant photos for a short search phrase via Openverse (openly licensed images,
 * no API key). Results are scored against the photo's title and tags so unrelated pictures
 * (a lion for "pan dulce") are dropped. Searches take 3-6 s, so results are cached in memory
 * and on disk, and in-flight lookups are shared.
 */

const CACHE_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", ".cache", "images.json");
const CACHE_VERSION = 2;
const cache = new Map<string, string[]>();
const inflight = new Map<string, Promise<string[]>>();

try {
  const saved = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as { v?: number; entries?: Record<string, string[]> };
  if (saved.v === CACHE_VERSION) for (const [k, v] of Object.entries(saved.entries ?? {})) cache.set(k, v);
} catch {
  // No cache yet.
}

let saveTimer: NodeJS.Timeout | null = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(dirname(CACHE_FILE), { recursive: true });
      writeFileSync(CACHE_FILE, JSON.stringify({ v: CACHE_VERSION, entries: Object.fromEntries(cache) }));
    } catch (err) {
      console.error("[images] could not save cache", err);
    }
  }, 1000);
}

const STOP = new Set(["a", "an", "the", "of", "with", "on", "in", "and", "for", "at", "to", "from", "by", "some", "photo", "picture", "image"]);

export function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/[\s-]+/g, " ").trim().slice(0, 80);
}

function words(query: string): string[] {
  return normalizeQuery(query)
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w));
}

interface OpenverseResult {
  url?: string;
  width?: number | null;
  title?: string | null;
  tags?: { name?: string }[] | null;
}

/** How many query words appear in a result's title or tags (plural-insensitive). */
function relevance(r: OpenverseResult, qWords: string[]): number {
  const text = `${r.title ?? ""} ${(r.tags ?? []).map((t) => t.name ?? "").join(" ")}`.toLowerCase();
  return qWords.filter((w) => text.includes(w.replace(/(es|s)$/, ""))).length;
}

async function search(query: string): Promise<string[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "20");
  url.searchParams.set("mature", "false");
  const res = await fetch(url, {
    headers: { "User-Agent": "create-dev-hackathon/0.1" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Openverse ${res.status}`);
  const data = (await res.json()) as { results?: OpenverseResult[] };
  const qWords = words(query);
  // Need most of the words to match for multi-word searches, at least one otherwise.
  const needed = qWords.length >= 3 ? 2 : 1;
  return (data.results ?? [])
    .filter((r) => typeof r.url === "string" && r.url.startsWith("https://") && (r.width ?? 1000) >= 500)
    .map((r) => ({ url: r.url as string, score: relevance(r, qWords) }))
    .filter((r) => r.score >= needed)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => r.url);
}

/** Candidate image URLs for exactly this query (possibly empty). Never throws. */
export async function lookup(rawQuery: string): Promise<string[]> {
  const query = normalizeQuery(rawQuery);
  if (!query) return [];
  const hit = cache.get(query);
  if (hit) return hit;
  let pending = inflight.get(query);
  if (!pending) {
    pending = search(query)
      .then((urls) => {
        cache.set(query, urls); // Cache misses too, so the same dead search isn't repeated.
        persist();
        return urls;
      })
      .catch((err) => {
        console.warn(`[images] "${query}" failed: ${err instanceof Error ? err.message : err}`);
        return [];
      })
      .finally(() => inflight.delete(query));
    inflight.set(query, pending);
  }
  return pending;
}

/**
 * Find a photo for a search, simplifying it if needed:
 * "mexican hot chocolate in a clay mug" -> "hot chocolate clay mug" -> "chocolate clay mug" -> "clay mug"...
 * Returns the query that worked (so the page can store it) or null if nothing relevant exists.
 */
export async function resolvePhoto(rawQuery: string): Promise<{ query: string; urls: string[] } | null> {
  const w = words(rawQuery);
  if (w.length === 0) return null;
  const attempts = [w.join(" ")];
  for (let i = 1; i <= w.length - 2; i++) attempts.push(w.slice(i).join(" "));
  if (w.length >= 3) attempts.push(w.slice(0, 2).join(" "));
  if (w.length <= 2) attempts.push(...w);
  for (const q of [...new Set(attempts)]) {
    const urls = await lookup(q);
    if (urls.length > 0) return { query: q, urls };
  }
  return null;
}

/** Stable pick so the same element keeps the same photo, while siblings vary. */
export function pick(urls: string[], seed: string): string | null {
  if (urls.length === 0) return null;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return urls[Math.abs(h) % urls.length];
}
