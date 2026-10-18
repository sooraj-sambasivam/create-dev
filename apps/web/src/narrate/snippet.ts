/**
 * Lasso snippets: which page elements a free-hand loop encloses, the lowest container that holds them, and the
 * sanitized markup + computed-style subset that goes to the tray. Pure logic over a tiny element interface so it
 * runs (and is tested) without a browser.
 */

export type Pt = { x: number; y: number };
export type BoxLike = { left: number; top: number; right: number; bottom: number; width: number; height: number };

export type SnipNode = { nodeType: number; nodeValue: string | null };
export interface SnipEl extends SnipNode {
  tagName: string;
  attributes: ArrayLike<{ name: string; value: string }>;
  childNodes: ArrayLike<SnipNode>;
  children: ArrayLike<SnipEl>;
  parentElement: SnipEl | null;
  getBoundingClientRect(): BoxLike;
}

export const SNIPPET_HTML_MAX = 20_480;
export const THUMB_MAX_BYTES = 60_000;
export const MIN_LOOP_PX = 12;

/** Even-odd point-in-polygon. */
export function pointInPolygon(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function boundsOf(poly: readonly Pt[]): { l: number; t: number; r: number; b: number; w: number; h: number; area: number } {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const p of poly) {
    if (p.x < l) l = p.x;
    if (p.x > r) r = p.x;
    if (p.y < t) t = p.y;
    if (p.y > b) b = p.y;
  }
  if (!poly.length) return { l: 0, t: 0, r: 0, b: 0, w: 0, h: 0, area: 0 };
  return { l, t, r, b, w: r - l, h: b - t, area: (r - l) * (b - t) };
}

/** Share (0..1) of a viewport-clipped box that lies inside the loop, from a 5x5 sample grid. */
export function loopCoverage(r: BoxLike, poly: readonly Pt[], vw: number, vh: number): number {
  const l = Math.max(0, r.left), t = Math.max(0, r.top), rr = Math.min(vw, r.right), bb = Math.min(vh, r.bottom);
  if (rr - l < 2 || bb - t < 2) return 0;
  let hit = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    if (pointInPolygon(l + ((i + 0.5) / 5) * (rr - l), t + ((j + 0.5) / 5) * (bb - t), poly)) hit++;
  }
  return hit / 25;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "META", "LINK", "IFRAME", "SVG", "CANVAS"]);

export type LoopOpts = { vw: number; vh: number; skip?: (el: SnipEl) => boolean; minCoverage?: number; maxVisited?: number };

/**
 * The elements whose box is mostly (>= 60 %) inside the loop. Elements larger than 1.5x the loop's bounding box
 * (page wrappers) never count, though their children are still visited.
 */
export function elementsInLoop(root: SnipEl, poly: readonly Pt[], o: LoopOpts): SnipEl[] {
  if (poly.length < 3) return [];
  const bb = boundsOf(poly);
  const min = o.minCoverage ?? 0.6;
  const cap = o.maxVisited ?? 6000;
  const out: SnipEl[] = [];
  let seen = 0;
  const walk = (parent: SnipEl): void => {
    for (let i = 0; i < parent.children.length; i++) {
      const c = parent.children[i]!;
      if (++seen > cap) return;
      if (SKIP_TAGS.has(c.tagName.toUpperCase()) || o.skip?.(c)) continue;
      const r = c.getBoundingClientRect();
      const has = r.width > 0 && r.height > 0;
      if (has && (r.right < bb.l || r.left > bb.r || r.bottom < bb.t || r.top > bb.b)) continue;
      if (has && r.width >= 4 && r.height >= 4 && r.width * r.height <= bb.area * 1.5 && loopCoverage(r, poly, o.vw, o.vh) >= min) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}

/** The lowest element that contains every element given (an element contains itself). */
export function lowestCommonContainer(els: readonly SnipEl[]): SnipEl | null {
  if (!els.length) return null;
  const has = (anc: SnipEl, e: SnipEl): boolean => {
    for (let n: SnipEl | null = e; n; n = n.parentElement) if (n === anc) return true;
    return false;
  };
  let a: SnipEl | null = els[0]!;
  for (const e of els) while (a && !has(a, e)) a = a.parentElement;
  return a;
}

/* ---------- sanitization (mirrors apps/server/src/tray/snippet.ts; the server re-checks everything) ---------- */

const ALLOWED_TAGS = new Set([
  "div", "span", "p", "a", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
  "h1", "h2", "h3", "h4", "h5", "h6", "img", "button", "section", "article", "header", "footer", "nav", "main",
  "aside", "figure", "figcaption", "strong", "em", "b", "i", "u", "small", "code", "pre", "blockquote", "br", "hr",
  "label", "time", "dl", "dt", "dd", "cite",
]);
const VOID = new Set(["br", "hr", "img"]);
const ALLOWED_ATTRS = new Set(["class", "id", "href", "src", "alt", "title", "role", "aria-label", "aria-current", "colspan", "rowspan", "datetime", "lang", "data-testid", "name", "type", "placeholder"]);
const SAFE_HREF = /^(https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+\d\s()-]+|#[\w-]*|\/[^\s"'<>]*)$/i;
const SAFE_SRC = /^(https?:\/\/[^\s"'<>]+|data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*)$/i;
const MAX_DEPTH = 24;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");

export function safeAttr(name: string, raw: string): string | null {
  const n = name.toLowerCase();
  if (!ALLOWED_ATTRS.has(n)) return null;
  const v = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 500);
  if (!v) return null;
  if (n === "href") return SAFE_HREF.test(v) ? v : null;
  if (n === "src") return SAFE_SRC.test(v) ? v : null;
  return v;
}

/**
 * Allow-listed outerHTML of `el` (tags, attributes and text only: no scripts, styles, handlers, forms or svg),
 * at most `max` characters. Over the cap, later siblings are left out so the markup stays balanced.
 */
export function sanitizeElementHtml(el: SnipEl, max = SNIPPET_HTML_MAX, resolveUrl: (u: string) => string = (u) => u): string {
  const budget = { left: max };
  const emit = (n: SnipEl, depth: number): string => {
    const tag = n.tagName.toLowerCase();
    if (SKIP_TAGS.has(n.tagName.toUpperCase())) return "";
    if (!ALLOWED_TAGS.has(tag)) return inner(n, depth); // unwrap unknown wrappers (custom elements, svg parts are skipped above)
    let attrs = "";
    for (let i = 0; i < n.attributes.length; i++) {
      const a = n.attributes[i]!;
      const name = a.name.toLowerCase();
      const v = safeAttr(name, name === "href" || name === "src" ? resolveUrl(a.value) : a.value);
      if (v !== null) attrs += ` ${name}="${escAttr(v)}"`;
    }
    if (tag === "img" && !/ src="/.test(attrs)) return "";
    if (tag === "a" && / href="/.test(attrs)) attrs += ' rel="noopener noreferrer"';
    const open = `<${tag}${attrs}>`;
    if (VOID.has(tag)) return cost(open) ? open : "";
    const close = `</${tag}>`;
    if (!cost(open + close)) return "";
    return open + inner(n, depth) + close;
  };
  const inner = (n: SnipEl, depth: number): string => {
    if (depth > MAX_DEPTH) return "";
    let s = "";
    for (let i = 0; i < n.childNodes.length; i++) {
      const c = n.childNodes[i]!;
      if (c.nodeType === 3) {
        const t = esc((c.nodeValue ?? "").replace(/\s+/g, " "));
        if (t.trim() && cost(t)) s += t;
        else if (t.trim()) break;
      } else if (c.nodeType === 1) {
        const piece = emit(c as SnipEl, depth + 1);
        if (!piece && budget.left <= 0) break;
        s += piece;
      }
    }
    return s;
  };
  const cost = (s: string): boolean => {
    if (s.length > budget.left) { budget.left = 0; return false; }
    budget.left -= s.length;
    return true;
  };
  return emit(el, 0);
}

/** The computed-style subset kept with a snippet (matches what /api/import-element understands, plus the look). */
export const STYLE_PROPS = [
  "display", "flexDirection", "color", "backgroundColor", "fontFamily", "fontSize", "fontWeight", "lineHeight",
  "textAlign", "padding", "margin", "borderRadius", "border", "boxShadow", "gap", "width", "height",
] as const;
const kebab = (p: string) => p.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

export function pickStyles(cs: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of STYLE_PROPS) {
    const v = cs[p];
    if (typeof v !== "string" || !v || v === "none" || v === "normal" || v === "0px" || v === "rgba(0, 0, 0, 0)") continue;
    out[kebab(p)] = v.slice(0, 200);
  }
  return out;
}

export type TrayPayload = {
  title: string;
  kind: string;
  url?: string;
  thumbnail?: string;
  snippetHtml: string;
  styles: Record<string, string>;
  source: { app: "narrate" | "extension"; url?: string; title?: string };
};

/** A short label for the snippet, from its heading or first text. */
export function titleOf(el: SnipEl, fallback = "Snippet"): string {
  const walk = (n: SnipEl, depth: number): string => {
    if (depth > 6) return "";
    for (let i = 0; i < n.childNodes.length; i++) {
      const c = n.childNodes[i]!;
      if (c.nodeType === 3) {
        const t = (c.nodeValue ?? "").replace(/\s+/g, " ").trim();
        if (t) return t;
      } else if (c.nodeType === 1) {
        const t = walk(c as SnipEl, depth + 1);
        if (t) return t;
      }
    }
    return "";
  };
  const t = walk(el, 0);
  return (t || fallback).slice(0, 80);
}

export function kindOf(el: SnipEl): string {
  const t = el.tagName.toLowerCase();
  if (t === "table") return "table";
  if (t === "ul" || t === "ol") return "list";
  if (t === "img") return "image";
  if (t === "form") return "form";
  return "snippet";
}
