export interface Point {
  x: number;
  y: number;
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Smooth start and stop. Symmetric, f(0)=0, f(.5)=.5, f(1)=1. */
export function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export interface BezierPath {
  p0: Point;
  c1: Point;
  c2: Point;
  p3: Point;
}

/**
 * Cubic bezier from a to b. The control points are pushed to one side of the
 * straight line so the cursor arcs like a hand, not a ruler. `bend` is the arc
 * height as a fraction of the distance; its sign picks the side.
 */
export function makePath(a: Point, b: Point, bend = 0.18): BezierPath {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { p0: a, c1: a, c2: b, p3: b };
  const nx = -dy / len;
  const ny = dx / len;
  const off = len * bend;
  return {
    p0: a,
    c1: { x: a.x + dx * 0.3 + nx * off, y: a.y + dy * 0.3 + ny * off },
    c2: { x: a.x + dx * 0.75 + nx * off * 0.6, y: a.y + dy * 0.75 + ny * off * 0.6 },
    p3: b,
  };
}

export function bezierAt(p: BezierPath, t: number): Point {
  const u = 1 - clamp01(t);
  const s = clamp01(t);
  const w0 = u * u * u;
  const w1 = 3 * u * u * s;
  const w2 = 3 * u * s * s;
  const w3 = s * s * s;
  return {
    x: w0 * p.p0.x + w1 * p.c1.x + w2 * p.c2.x + w3 * p.p3.x,
    y: w0 * p.p0.y + w1 * p.c1.y + w2 * p.c2.y + w3 * p.p3.y,
  };
}

/** Position at normalized time t: easing applied to the path parameter. */
export function pointAtTime(p: BezierPath, t: number): Point {
  return bezierAt(p, easeInOutCubic(t));
}

/** Glide time in ms: longer for longer hops, clamped. */
export function glideDuration(a: Point, b: Point): number {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return Math.round(Math.min(1100, Math.max(280, 220 + d * 0.9)));
}
