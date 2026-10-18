import { ScreenSchema, type Node, type Screen, type Style } from "@create/shared";

/**
 * Deterministic converter from a sanitized DOM snapshot (captured by apps/extension) to a Create Screen.
 * It only reads snapshot data; it never fetches anything.
 */

export const MAX_DEPTH = 6;
export const MAX_NODES = 300;
export const MAX_TEXT = 300;

export interface SnapshotStyle {
  fontSize?: string;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  textAlign?: string;
  display?: string;
  flexDirection?: string;
}

export interface SnapshotNode {
  tag: string;
  text?: string;
  src?: string;
  alt?: string;
  href?: string;
  /** Rendered height in px (images only); picks the Create image size. */
  h?: number;
  style?: SnapshotStyle;
  children?: SnapshotNode[];
}

export interface Snapshot {
  title?: string;
  url?: string;
  root: SnapshotNode;
}

type Ctx = { n: number; accent: string | null };

/** 'rgb(r, g, b)' / 'rgba(...)' / '#hex' to '#rrggbb'. Transparent and unparseable values give null. */
export function toHex(css: string | undefined): string | null {
  if (!css) return null;
  const v = css.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  const m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (!m) return null;
  if (m[4] !== undefined) {
    const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (!(a > 0.05)) return null;
  }
  return "#" + [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("");
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function fontStep(px: string | undefined): Style["fontSize"] | null {
  const n = px ? parseFloat(px) : NaN;
  if (!Number.isFinite(n)) return null;
  if (n < 14) return "sm";
  if (n < 18) return "base";
  if (n < 22) return "lg";
  if (n < 28) return "xl";
  if (n < 36) return "2xl";
  if (n < 48) return "3xl";
  if (n < 64) return "4xl";
  return "5xl";
}

function weightOf(w: string | undefined): Style["weight"] | null {
  const n = w === "bold" ? 700 : w === "normal" ? 400 : parseInt(w ?? "", 10);
  if (!Number.isFinite(n)) return null;
  if (n >= 900) return "black";
  if (n >= 700) return "bold";
  if (n >= 600) return "semibold";
  if (n >= 500) return "medium";
  return null;
}

function styleOf(s: SnapshotStyle | undefined, opts: { text: boolean; box: boolean }): Style | null {
  if (!s) return null;
  const out: Style = {};
  if (opts.text) {
    const color = toHex(s.color);
    if (color) out.color = color;
    const fs = fontStep(s.fontSize);
    if (fs && fs !== "base") out.fontSize = fs;
    const w = weightOf(s.fontWeight);
    if (w) out.weight = w;
    if (s.textAlign === "center" || s.textAlign === "right") out.align = s.textAlign;
  }
  if (opts.box) {
    const bg = toHex(s.backgroundColor);
    if (bg) out.background = bg;
  }
  return Object.keys(out).length ? out : null;
}

function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  return /^(#[\w-]+|https?:\/\/\S+|mailto:\S+|tel:[+\d\s()-]+)$/i.test(href) ? href : null;
}

function clean(t: string | undefined): string {
  return (t ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

/** All text in a subtree, in order. */
function deepText(n: SnapshotNode): string {
  return clean([n.text ?? "", ...(n.children ?? []).map(deepText)].join(" "));
}

function imageSize(h: number | undefined): "logo" | "small" | "medium" | "full" {
  if (!h || !Number.isFinite(h) || h > 240) return "full";
  return h <= 60 ? "logo" : h <= 120 ? "small" : "medium";
}

const HEADING = /^h([1-6])$/;
const SKIP = new Set(["script", "style", "noscript", "svg", "path", "iframe", "canvas", "template", "head", "meta", "link"]);
const INLINE_TEXT = new Set(["p", "span", "label", "em", "strong", "b", "i", "small", "li", "blockquote", "figcaption", "td", "th", "dt", "dd", "cite", "time", "code", "pre"]);

function id(ctx: Ctx, tag: string): string {
  return `${tag.replace(/[^a-z0-9]/g, "") || "el"}-${++ctx.n}`;
}

function convertNode(n: SnapshotNode, ctx: Ctx, depth: number): Node[] {
  const tag = (n.tag || "div").toLowerCase();
  if (SKIP.has(tag) || depth > MAX_DEPTH) return [];
  const kids = n.children ?? [];
  const own = clean(n.text);

  const h = tag.match(HEADING);
  if (h) {
    const text = deepText(n);
    if (!text) return [];
    return [{ id: id(ctx, tag), type: "heading", text, level: Math.min(3, Number(h[1])) as 1 | 2 | 3, style: styleOf(n.style, { text: true, box: false }) } as Node];
  }

  if (tag === "img") {
    const src = n.src && /^https:\/\/\S+$/.test(n.src) ? n.src : null;
    const alt = clean(n.alt) || "Image";
    return [{ id: id(ctx, tag), type: "image", alt, src, query: src ? null : alt.slice(0, 60), aspect: "video", size: imageSize(n.h) } as Node];
  }

  if (tag === "button" || tag === "a") {
    const label = deepText(n);
    const bg = toHex(n.style?.backgroundColor);
    const imgChild = kids.find((k) => k.tag?.toLowerCase() === "img");
    if (!label && imgChild && tag === "a") return convertNode(imgChild, ctx, depth + 1);
    if (!label) return [];
    const href = safeHref(n.href);
    if (tag === "button" || bg) {
      if (bg && !ctx.accent && luminance(bg) < 0.9 && luminance(bg) > 0.03) ctx.accent = bg;
      return [{ id: id(ctx, tag), type: "button", label, variant: bg ? "primary" : "secondary", href } as Node];
    }
    return [{ id: id(ctx, tag), type: "link", text: label, href, style: styleOf(n.style, { text: true, box: false }) } as Node];
  }

  if ((tag === "ul" || tag === "ol") && kids.length > 0 && kids.every((k) => k.tag?.toLowerCase() === "li")) {
    const items = kids.map(deepText).filter(Boolean);
    if (items.length) return [{ id: id(ctx, tag), type: "list", items, marker: tag === "ol" ? "number" : "bullet" } as Node];
    return [];
  }

  if (tag === "input" || tag === "textarea") {
    return [{ id: id(ctx, tag), type: "textbox", label: clean(n.alt), placeholder: clean(n.text), multiline: tag === "textarea" } as Node];
  }
  if (tag === "hr") return [{ id: id(ctx, tag), type: "divider" } as Node];

  // Leaf-ish text elements (p, span, ...) with no element children.
  if (kids.length === 0) {
    if (!own) return [];
    return [{ id: id(ctx, tag), type: "text", text: own, tone: "default", style: styleOf(n.style, { text: true, box: false }) } as Node];
  }

  // Text-only wrapper whose children are all inline text collapses to one text node.
  if (INLINE_TEXT.has(tag) && kids.every((k) => INLINE_TEXT.has(k.tag?.toLowerCase()) && !(k.children?.length))) {
    const text = deepText(n);
    if (!text) return [];
    return [{ id: id(ctx, tag), type: "text", text, tone: "default", style: styleOf(n.style, { text: true, box: false }) } as Node];
  }

  // Containers: section (column) or row by flex-direction.
  const children: Node[] = [];
  if (own) children.push({ id: id(ctx, "text"), type: "text", text: own, tone: "default" } as Node);
  for (const k of kids) {
    if (ctx.n >= MAX_NODES) break;
    children.push(...convertNode(k, ctx, depth + 1));
  }
  if (children.length === 0) return [];
  const flex = /flex|grid/.test(n.style?.display ?? "");
  const row = flex && (n.style?.flexDirection ?? "row").startsWith("row") && n.style?.display !== "grid";
  const bg = toHex(n.style?.backgroundColor);
  return [
    {
      id: id(ctx, tag),
      type: "container",
      direction: row ? "row" : "column",
      gap: "md",
      align: row ? "center" : "stretch",
      justify: "start",
      padding: bg ? "md" : "none",
      background: "none",
      width: "full",
      wrap: row && children.length > 3,
      overlay: "dark",
      style: styleOf(n.style, { text: false, box: true }),
      children,
    } as Node,
  ];
}

/** Snapshot to a validated Screen. Throws a ZodError if the result is not a valid Screen. */
export function domToScreen(snapshot: Snapshot): Screen {
  const ctx: Ctx = { n: 0, accent: null };
  const nodes = convertNode(snapshot.root, ctx, 0);
  const rootBg = toHex(snapshot.root.style?.backgroundColor);
  const children: Node[] = nodes.length
    ? nodes
    : [{ id: "empty-1", type: "text", text: "Nothing readable was captured from that element.", tone: "muted" } as Node];
  return ScreenSchema.parse({
    title: clean(snapshot.title).slice(0, 80) || "Imported element",
    theme: rootBg && luminance(rootBg) < 0.3 ? "dark" : "light",
    accent: ctx.accent,
    font: "sans",
    children,
  });
}

/** Count nodes and max depth of a snapshot (used to enforce caps). */
export function measure(root: SnapshotNode): { nodes: number; depth: number } {
  let nodes = 0;
  let depth = 0;
  const walk = (n: SnapshotNode, d: number) => {
    nodes++;
    depth = Math.max(depth, d);
    for (const c of n.children ?? []) walk(c, d + 1);
  };
  walk(root, 0);
  return { nodes, depth };
}
