/**
 * Pure helpers for the page-shaped canvas: page geometry, stroke grouping and label-popover placement.
 * No tldraw or React imports, so everything here is unit-testable.
 */

/** The page is always this wide in page units; the camera fits it to the pane width. */
export const PAGE_W = 1200;
/** Section guide lines every this many units. */
export const SECTION_H = 600;
/** The page never gets shorter than this. */
export const MIN_PAGE_H = 1800;
/** Empty room kept below the lowest ink so the page grows as you draw lower. */
export const PAGE_SLACK = 900;
/** The label popover shows this long after the pointer lifts. */
export const POPOVER_IDLE_MS = 600;

export type Box = { x: number; y: number; w: number; h: number };
export type Region = { x: number; y: number; w: number; h: number };

/** Union of boxes; null when empty. */
export function unionBounds(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Page height for the lowest ink: grows in whole sections so the frame does not jitter. */
export function pageHeightFor(maxBottom: number): number {
  const need = Math.max(0, Number.isFinite(maxBottom) ? maxBottom : 0) + PAGE_SLACK;
  return Math.max(MIN_PAGE_H, Math.ceil(need / SECTION_H) * SECTION_H);
}

/** Y positions of the section guide lines (excluding the top edge) inside a page of the given height. */
export function sectionLines(pageH: number): number[] {
  const out: number[] = [];
  for (let y = SECTION_H; y < pageH; y += SECTION_H) out.push(y);
  return out;
}

/** The tldraw camera options that make the canvas a vertical-scroll-only page. */
export function pageCameraOptions(pageH: number) {
  return {
    isLocked: false,
    panSpeed: 1,
    zoomSpeed: 1,
    zoomSteps: [1],
    wheelBehavior: "pan" as const,
    constraints: {
      bounds: { x: 0, y: 0, w: PAGE_W, h: pageH },
      padding: { x: 24, y: 24 },
      origin: { x: 0.5, y: 0 },
      initialZoom: "fit-x" as const,
      baseZoom: "fit-x" as const,
      behavior: { x: "fixed" as const, y: "inside" as const },
    },
  };
}

/** Region of the page a stroke group covers, in page units, clamped to the page width. */
export function regionFromBounds(boxes: readonly Box[]): Region | null {
  const u = unionBounds(boxes);
  if (!u) return null;
  const x = Math.min(PAGE_W - 1, Math.max(0, Math.round(u.x)));
  const right = Math.min(PAGE_W, Math.max(x + 1, Math.round(u.x + u.w)));
  const y = Math.max(0, Math.round(u.y));
  const bottom = Math.max(y + 1, Math.round(u.y + u.h));
  return { x, y, w: right - x, h: bottom - y };
}

export type BuiltGroup = { id: string; label: string; ids: string[] };
export type GroupState = {
  /** Stroke ids drawn since the last Confirm: the one open group. */
  open: string[];
  built: BuiltGroup[];
};
export const initialGroupState: GroupState = { open: [], built: [] };

export type GroupAction =
  | { type: "stroke"; id: string }
  | { type: "remove"; id: string }
  | { type: "discard" }
  | { type: "confirm"; groupId: string; label: string }
  | { type: "hydrate"; built: BuiltGroup[] };

/** One group per Confirm: every stroke since the last confirm joins the open group; confirming closes it as built. */
export function groupReducer(state: GroupState, a: GroupAction): GroupState {
  switch (a.type) {
    case "stroke":
      if (state.open.includes(a.id) || state.built.some((g) => g.ids.includes(a.id))) return state;
      return { ...state, open: [...state.open, a.id] };
    case "remove": {
      const open = state.open.filter((i) => i !== a.id);
      const built = state.built
        .map((g) => ({ ...g, ids: g.ids.filter((i) => i !== a.id) }))
        .filter((g) => g.ids.length > 0);
      return open.length === state.open.length && built.length === state.built.length && built.every((g, i) => g.ids.length === state.built[i].ids.length)
        ? state
        : { open, built };
    }
    case "discard":
      return { ...state, open: [] };
    case "confirm": {
      if (!state.open.length) return state;
      return { open: [], built: [...state.built, { id: a.groupId, label: a.label, ids: state.open }] };
    }
    case "hydrate":
      return { open: state.open, built: a.built };
  }
}

/** Rebuild built groups from shape meta (kept on the shapes so they survive a reload). */
export function builtGroupsFromShapes(shapes: readonly { id: string; meta?: Record<string, unknown> }[]): BuiltGroup[] {
  const map = new Map<string, BuiltGroup>();
  for (const s of shapes) {
    const gid = s.meta?.builtGroup;
    if (typeof gid !== "string") continue;
    const g = map.get(gid) ?? { id: gid, label: typeof s.meta?.builtLabel === "string" ? s.meta.builtLabel : "", ids: [] };
    g.ids.push(s.id);
    map.set(gid, g);
  }
  return [...map.values()];
}

const POP_W = 296;
const POP_H = 148;

/** Popover placement (container pixels): under the group, flipped above near the bottom, kept inside the container. */
export function popoverPosition(screenBox: Box | null, containerW: number, containerH: number): { left: number; top: number } {
  if (!screenBox) return { left: 16, top: 16 };
  const left = Math.min(Math.max(8, screenBox.x), Math.max(8, containerW - POP_W - 8));
  let top = screenBox.y + screenBox.h + 10;
  if (top + POP_H > containerH - 8) top = screenBox.y - POP_H - 10;
  top = Math.min(Math.max(8, top), Math.max(8, containerH - POP_H - 8));
  return { left, top };
}
