export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** tldraw's editor.screenToPage: client (viewport) coordinates -> page coordinates. */
export type ScreenToPage = (p: Pt) => Pt;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Pointer client coordinates -> PAGE coordinates (camera and container offset applied by tldraw). */
export function clientToPage(screenToPage: ScreenToPage, clientX: number, clientY: number): Pt {
  const p = screenToPage({ x: clientX, y: clientY });
  return { x: round1(p.x), y: round1(p.y) };
}

/** Normalised rect between two corner points (any drag direction). */
export function rectFromPoints(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export const SAMPLE_HZ = 30;
export const MAX_PATH_POINTS = 20_000;

/** One pointer sample in page coordinates. `id` is the shape under the pointer then (null: none). */
export type PathPoint = { t: number; x: number; y: number; id: string | null };

/**
 * Records the pointer path at most `hz` times per second, skipping samples where the pointer did not move
 * and the hovered shape did not change.
 */
export function createPathRecorder(hz = SAMPLE_HZ, max = MAX_PATH_POINTS) {
  const minGap = 1000 / hz;
  const points: PathPoint[] = [];
  return {
    points,
    /** Returns true when the sample was stored. */
    add(t: number, p: Pt, id: string | null): boolean {
      const last = points[points.length - 1];
      if (last) {
        if (t - last.t < minGap) return false;
        if (last.x === p.x && last.y === p.y && last.id === id) return false;
      }
      if (points.length >= max) return false;
      points.push({ t, x: p.x, y: p.y, id });
      return true;
    },
  };
}

/** Client coordinates -> coordinates local to `box` (a container's bounding rect). */
export function clientToLocal(box: { left: number; top: number }, clientX: number, clientY: number): Pt {
  return { x: clientX - box.left, y: clientY - box.top };
}

/** True when the client point lies inside `box` (edges inclusive on the top/left, exclusive on the bottom/right). */
export function isInsideBox(box: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): boolean {
  return clientX >= box.left && clientY >= box.top && clientX < box.left + box.width && clientY < box.top + box.height;
}

export const BUBBLE_OFFSET = 16;
export const BUBBLE_EDGE = 8;

/**
 * Top-left of the speech bubble for a pointer at `local`. It sits `offset` px to the bottom-right of the
 * pointer; near the right or bottom edge it flips to the other side so it never covers the pointer.
 */
export function placeBubble(
  local: Pt,
  bubble: { w: number; h: number },
  area: { w: number; h: number },
  offset = BUBBLE_OFFSET,
  edge = BUBBLE_EDGE,
): Pt {
  let x = local.x + offset;
  if (x + bubble.w > area.w - edge) x = local.x - offset - bubble.w;
  let y = local.y + offset;
  if (y + bubble.h > area.h - edge) y = local.y - offset - bubble.h;
  return {
    x: Math.max(edge, Math.min(x, Math.max(edge, area.w - bubble.w - edge))),
    y: Math.max(edge, Math.min(y, Math.max(edge, area.h - bubble.h - edge))),
  };
}
