/** Geometry for the pointer's marks. Pure, so the shapes can be unit tested. */

export type Rect = { x: number; y: number; w: number; h: number };

const f = (n: number) => n.toFixed(1);

/** Rounded rect as an SVG sub-path (clockwise). */
export function roundedRect(r: Rect, radius: number): string {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  const { x, y, w, h } = r;
  return `M${f(x + rad)} ${f(y)}H${f(x + w - rad)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + rad)}V${f(y + h - rad)}Q${f(x + w)} ${f(y + h)} ${f(x + w - rad)} ${f(y + h)}H${f(x + rad)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - rad)}V${f(y + rad)}Q${f(x)} ${f(y)} ${f(x + rad)} ${f(y)}Z`;
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

/** A thread from `a` to `b`: a gentle curve that sags toward the page. */
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
