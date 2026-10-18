/** Pure placement for the route tooltip: beside the hovered node, in empty space, never over other nodes or edge labels. */

export type Rect = { x: number; y: number; w: number; h: number };
export type Side = "right" | "left" | "below" | "above";
export type TipPlacement = { x: number; y: number; side: Side; clear: boolean };

const ORDER: Side[] = ["right", "left", "below", "above"];

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Tries the four sides of `anchor` in order (right, left, below, above). A side is
 * usable when the tooltip fits inside `bounds` without being clipped and overlaps no
 * obstacle. The first usable side wins, so a tooltip flips away from an edge. When no
 * side is clear, the side with the least obstacle overlap is used and `clear` is false.
 */
export function placeTooltip(opts: {
  bounds: { w: number; h: number };
  anchor: Rect;
  size: { w: number; h: number };
  obstacles: Rect[];
  gap?: number;
}): TipPlacement {
  const { bounds, anchor, size, gap = 8 } = opts;
  const obstacles = [anchor, ...opts.obstacles];
  const maxX = bounds.w - size.w;
  const maxY = bounds.h - size.h;

  const raw: Record<Side, { x: number; y: number }> = {
    right: { x: anchor.x + anchor.w + gap, y: anchor.y },
    left: { x: anchor.x - gap - size.w, y: anchor.y },
    below: { x: anchor.x, y: anchor.y + anchor.h + gap },
    above: { x: anchor.x, y: anchor.y - gap - size.h },
  };

  const cost = (side: Side) => {
    const p = raw[side];
    const rect = { x: clamp(p.x, 0, Math.max(0, maxX)), y: clamp(p.y, 0, Math.max(0, maxY)), w: size.w, h: size.h };
    return { rect, overlap: obstacles.reduce((sum, o) => sum + overlapArea(rect, o), 0) };
  };

  for (const side of ORDER) {
    const p = raw[side];
    const fits = p.x >= 0 && p.y >= 0 && p.x <= maxX && p.y <= maxY;
    if (!fits) continue;
    if (cost(side).overlap === 0) return { x: p.x, y: p.y, side, clear: true };
  }

  let best: { side: Side; x: number; y: number; overlap: number } | null = null;
  for (const side of ORDER) {
    const { rect, overlap } = cost(side);
    if (!best || overlap < best.overlap) best = { side, x: rect.x, y: rect.y, overlap };
  }
  return { x: best!.x, y: best!.y, side: best!.side, clear: false };
}

/** Rough box for an SVG edge label drawn at `mid` (text-anchor middle, baseline 6px above mid). */
export function edgeLabelRect(mid: { x: number; y: number }, text: string, fontSize = 12): Rect {
  const w = text.length * fontSize * 0.56 + 8;
  const h = fontSize + 6;
  return { x: mid.x - w / 2, y: mid.y - 6 - fontSize, w, h };
}
