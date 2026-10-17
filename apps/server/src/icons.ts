/**
 * Icon name checking and search via Iconify (200k+ open icons, no API key).
 * The model guesses names like "fluent-emoji-flat:shopping-cart"; names that don't exist
 * are replaced with the closest search hit so the page never shows a broken icon.
 */

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
