/**
 * Geometry for the pointer's drawn marks. Pure and seeded, so the same target always gets the same
 * hand-drawn line (no flicker between renders) and the shapes can be unit tested.
 */

export type Rect = { x: number; y: number; w: number; h: number };

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed from a string (a node id). */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Below this on its short side, a target is "small": a clean 1.5px pen line, no wobble. */
export const PRECISION_MAX_PX = 56;
/** Above this on its long side, a target is "large": the wobble is allowed to be bigger. */
export const WOBBLE_MIN_PX = 240;

export const isPrecise = (r: Rect): boolean => Math.min(r.w, r.h) <= PRECISION_MAX_PX;

/** Wobble amplitude in px: none for small targets, up to 2.5px for large ones. */
export function wobbleAmount(r: Rect): number {
  if (isPrecise(r)) return 0;
  return Math.max(0.8, Math.min(2.5, Math.max(r.w, r.h) / WOBBLE_MIN_PX));
}

const f = (n: number) => n.toFixed(1);

/**
 * A rounded rectangle drawn by hand: each side is a quadratic curve whose control point is nudged by up to
 * `amp` px, and the pen overshoots its starting corner a little before lifting. With amp 0 it is a clean
 * rounded rect with the same overshoot-free closing. Always starts at the top-left and runs clockwise.
 */
export function inkOutlinePath(r: Rect, seed: number, amp = wobbleAmount(r), radius = 8): string {
  const rand = rng(seed);
  const j = () => (amp === 0 ? 0 : (rand() - 0.5) * 2 * amp);
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  const { x, y, w, h } = r;
  const x2 = x + w;
  const y2 = y + h;
  const d: string[] = [];
  d.push(`M${f(x + rad)} ${f(y + j())}`);
  d.push(`Q${f(x + w / 2)} ${f(y + j() * 1.6)} ${f(x2 - rad)} ${f(y + j())}`);
  d.push(`Q${f(x2 + j())} ${f(y + j())} ${f(x2 + j())} ${f(y + rad)}`);
  d.push(`Q${f(x2 + j() * 1.6)} ${f(y + h / 2)} ${f(x2 + j())} ${f(y2 - rad)}`);
  d.push(`Q${f(x2 + j())} ${f(y2 + j())} ${f(x2 - rad)} ${f(y2 + j())}`);
  d.push(`Q${f(x + w / 2)} ${f(y2 + j() * 1.6)} ${f(x + rad)} ${f(y2 + j())}`);
  d.push(`Q${f(x + j())} ${f(y2 + j())} ${f(x + j())} ${f(y2 - rad)}`);
  d.push(`Q${f(x + j() * 1.6)} ${f(y + h / 2)} ${f(x + j())} ${f(y + rad)}`);
  // Overshoot past the start, so the ring does not look machine-closed.
  d.push(`Q${f(x + j())} ${f(y + j())} ${f(x + rad + (amp === 0 ? 0 : 5))} ${f(y + (amp === 0 ? 0 : j()))}`);
  return d.join(" ");
}

/** An approximate length for stroke-dasharray (the real path is never longer than this by much). */
export function outlineLength(r: Rect, amp = wobbleAmount(r)): number {
  return Math.ceil(2 * (r.w + r.h) * (1 + amp / 40) + 12);
}

/** Four corner brackets (Luminous). `len` is each arm's length, clamped to a third of the short side. */
export function bracketPath(r: Rect, len = 14): string {
  const l = Math.max(4, Math.min(len, Math.min(r.w, r.h) / 3));
  const { x, y, w, h } = r;
  const x2 = x + w;
  const y2 = y + h;
  return [
    `M${f(x)} ${f(y + l)}V${f(y)}H${f(x + l)}`,
    `M${f(x2 - l)} ${f(y)}H${f(x2)}V${f(y + l)}`,
    `M${f(x2)} ${f(y2 - l)}V${f(y2)}H${f(x2 - l)}`,
    `M${f(x + l)} ${f(y2)}H${f(x)}V${f(y2 - l)}`,
  ].join("");
}

/** Rounded rect as an SVG sub-path (clockwise). */
export function roundedRect(r: Rect, radius: number): string {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  const { x, y, w, h } = r;
  return `M${f(x + rad)} ${f(y)}H${f(x + w - rad)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + rad)}V${f(y + h - rad)}Q${f(x + w)} ${f(y + h)} ${f(x + w - rad)} ${f(y + h)}H${f(x + rad)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - rad)}V${f(y + rad)}Q${f(x)} ${f(y)} ${f(x + rad)} ${f(y)}Z`;
}

/** The dimming layer: the whole viewport with a rounded hole around the target (even-odd fill). */
export function spotlightPath(viewport: { w: number; h: number }, hole: Rect | null, radius = 10, pad = 4): string {
  const outer = `M0 0H${f(viewport.w)}V${f(viewport.h)}H0Z`;
  if (!hole) return outer;
  return outer + roundedRect({ x: hole.x - pad, y: hole.y - pad, w: hole.w + pad * 2, h: hole.h + pad * 2 }, radius);
}

/** The point on a rectangle's edge nearest to `from` (where a thread should land, so it never crosses the target). */
export function edgeAnchor(r: Rect, from: { x: number; y: number }): { x: number; y: number } {
  const cx = Math.min(Math.max(from.x, r.x), r.x + r.w);
  const cy = Math.min(Math.max(from.y, r.y), r.y + r.h);
  // Inside the rect: push out to the nearest edge.
  if (from.x > r.x && from.x < r.x + r.w && from.y > r.y && from.y < r.y + r.h) {
    const dl = from.x - r.x;
    const dr = r.x + r.w - from.x;
    const dt = from.y - r.y;
    const db = r.y + r.h - from.y;
    const m = Math.min(dl, dr, dt, db);
    if (m === dt) return { x: from.x, y: r.y };
    if (m === db) return { x: from.x, y: r.y + r.h };
    if (m === dl) return { x: r.x, y: from.y };
    return { x: r.x + r.w, y: from.y };
  }
  return { x: cx, y: cy };
}

/** A thread from `a` to `b`: a gentle curve that sags toward the page (Paper pen line, Luminous glow thread). */
export function threadPath(a: { x: number; y: number }, b: { x: number; y: number }, sag = 0.18): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular offset, always bowing upward so the line arcs over the content, not through it.
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const k = len * sag;
  return `M${f(a.x)} ${f(a.y)}Q${f(mx + nx * k)} ${f(my + ny * k)} ${f(b.x)} ${f(b.y)}`;
}

export const pathLength = (a: { x: number; y: number }, b: { x: number; y: number }, sag = 0.18): number =>
  Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * (1 + sag * 0.7) + 8);

/** How much of a string a write-on has typed after `elapsedMs` at `msPerChar`. */
export function typedSlice(text: string, elapsedMs: number, msPerChar = 18): string {
  if (elapsedMs <= 0) return "";
  const n = Math.min(text.length, Math.floor(elapsedMs / msPerChar));
  return text.slice(0, n);
}

/** Splits a spoken line around its first deictic word ("make this bigger" -> ["make ", "this", " bigger"]). */
export function splitDeictic(line: string): [string, string, string] | null {
  const m = /\b(this|that|these|those|here|it)\b/i.exec(line);
  if (!m) return null;
  return [line.slice(0, m.index), m[0], line.slice(m.index + m[0].length)];
}

/** Where the label chip's measurement ticks sit: along the top edge and the left edge of the target. */
export function tickMarks(r: Rect, step = 40): { top: number[]; left: number[] } {
  const top: number[] = [];
  const left: number[] = [];
  for (let x = step; x < r.w; x += step) top.push(r.x + x);
  for (let y = step; y < r.h; y += step) left.push(r.y + y);
  return { top: top.slice(0, 24), left: left.slice(0, 24) };
}
