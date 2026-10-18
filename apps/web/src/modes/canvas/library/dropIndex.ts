import { MIN_PAGE_H } from "../groups";

/** Child slot for a section dropped at page-space y: proportional to the (minimum) page height, clamped to 0..count. */
export function sectionIndexForY(y: number, count: number, pageH = MIN_PAGE_H): number {
  if (!Number.isFinite(y) || count <= 0) return 0;
  const t = Math.min(1, Math.max(0, y / pageH));
  return Math.min(count, Math.round(t * count));
}
