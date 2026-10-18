import type { PixelBox } from "@create/shared";

export const area = (b: PixelBox): number => Math.max(0, b.w) * Math.max(0, b.h);

export function iou(a: PixelBox, b: PixelBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

export const contains = (b: PixelBox, p: { x: number; y: number }): boolean =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** Distance from a point to the nearest edge of the box (0 when inside). */
export function distanceTo(b: PixelBox, p: { x: number; y: number }): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Box from corner coordinates, or null when degenerate or non-finite. */
export function boxFromCorners(x1: number, y1: number, x2: number, y2: number): PixelBox | null {
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  const w = x2 - x1;
  const h = y2 - y1;
  return w > 0 && h > 0 ? { x: x1, y: y1, w, h } : null;
}
