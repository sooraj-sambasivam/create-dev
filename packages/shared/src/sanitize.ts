import { NODE_TYPES } from "./schema";

/**
 * Forgiving cleanup of model (or hand-written) JSON before strict Zod validation.
 * Small mistakes are fixed or dropped instead of failing the whole page:
 * unknown element types are removed, bad links/colors/sources are cleared, missing or
 * duplicate ids are fixed, and bare icon names get a default set. Returns notes describing
 * anything that was removed, so the caller can tell the user.
 */

const HREF_RE = /^(#[\w-]+|https?:\/\/\S+|mailto:\S+|tel:[+\d\s()-]+)$/i;
const SRC_RE = /^(\/api\/uploads\/[\w.-]+|https:\/\/\S+)$/;
const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
const ICON_RE = /^[a-z0-9-]+:[a-z0-9-]+$/i;
const COLOR_KEYS = ["color", "background", "gradientTo"];

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function fixIcon(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().replace(/\s+/g, "-");
  if (ICON_RE.test(v)) return v;
  if (/^[a-z0-9-]+$/.test(v)) return `lucide:${v}`;
  return null;
}

/** Normalised route key: no query string, no trailing slash. */
const routeKey = (r: string) => r.split("?")[0].replace(/\/+$/, "") || "/";

/**
 * `routes` are the backend routes that exist; `data` elements pointing anywhere else are dropped.
 * Without routes, every data element is dropped (there is nothing to read from).
 */
export function sanitizeNodes(input: unknown, notes: string[] = [], taken = new Set<string>(), routes: readonly string[] = []): Json[] {
  if (!Array.isArray(input)) return [];
  const out: Json[] = [];
  for (const raw of input) {
    if (!isObj(raw)) continue;
    const node: Json = { ...raw };
    const type = node.type;
    if (typeof type !== "string" || !(NODE_TYPES as readonly string[]).includes(type)) {
      notes.push(`Skipped an unsupported element type "${String(type)}".`);
      continue;
    }

    if (type === "data") {
      const route = isObj(node.source) && typeof node.source.route === "string" ? routeKey(node.source.route) : null;
      if (!route || !routes.some((r) => routeKey(r) === route)) {
        notes.push("Skipped a live-data element because no matching backend route exists.");
        continue;
      }
      const src: Json = { ...(node.source as Json) };
      if (isObj(src.params)) {
        src.params = Object.fromEntries(Object.entries(src.params).map(([k, v]) => [k, String(v)]));
      } else delete src.params;
      node.source = src;
      if (typeof node.refreshSec === "number") node.refreshSec = Math.min(3600, Math.max(5, Math.round(node.refreshSec)));
      else delete node.refreshSec;
    }

    let nid = typeof node.id === "string" && node.id.trim() ? node.id.trim() : `${type}-${taken.size + 1}`;
    for (let n = 2; taken.has(nid); n++) nid = `${String(node.id || type)}-${n}`;
    taken.add(nid);
    node.id = nid;

    if ("href" in node && node.href != null && !(typeof node.href === "string" && HREF_RE.test(node.href.trim()))) {
      delete node.href;
    } else if (typeof node.href === "string") node.href = node.href.trim();
    for (const key of ["src", "bgSrc"]) {
      if (key in node && node[key] != null && !(typeof node[key] === "string" && SRC_RE.test(node[key] as string))) delete node[key];
    }
    if ("icon" in node && node.icon != null) {
      const icon = fixIcon(node.icon);
      if (icon) node.icon = icon;
      else delete node.icon;
    }
    if (type === "icon") {
      const icon = fixIcon(node.name);
      if (!icon) {
        notes.push("Skipped an icon without a valid name.");
        continue;
      }
      node.name = icon;
    }
    if (isObj(node.style)) {
      const style: Json = { ...node.style };
      for (const k of COLOR_KEYS) {
        if (style[k] != null && !(typeof style[k] === "string" && COLOR_RE.test(style[k] as string))) delete style[k];
      }
      node.style = style;
    } else if (node.style != null) delete node.style;
    if (typeof node.widthPct === "number") node.widthPct = Math.min(100, Math.max(5, Math.round(node.widthPct)));
    else delete node.widthPct;

    if (type === "table" && Array.isArray(node.columns) && Array.isArray(node.rows)) {
      const cols = node.columns.length;
      node.rows = (node.rows as unknown[]).filter(Array.isArray).map((r) => {
        const row = (r as unknown[]).map((c) => String(c ?? ""));
        return row.length >= cols ? row.slice(0, cols) : [...row, ...Array(cols - row.length).fill("")];
      });
    }
    if (type === "container") node.children = sanitizeNodes(node.children, notes, taken, routes);
    out.push(node);
  }
  return out;
}

export function sanitizeScreen(input: unknown, notes: string[] = [], routes: readonly string[] = []): unknown {
  if (!isObj(input)) return input;
  const screen: Json = { ...input };
  if (screen.accent != null && !(typeof screen.accent === "string" && COLOR_RE.test(screen.accent))) delete screen.accent;
  screen.children = sanitizeNodes(screen.children, notes, new Set<string>(), routes);
  return screen;
}
