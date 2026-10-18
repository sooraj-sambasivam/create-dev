/**
 * Placement for the narrate "Listening" bar. Pure geometry, so it can be unit-tested with mock rects.
 *
 * The bar is centred horizontally on the main card and sits BAR_GAP above the composer's top edge,
 * inside the card. It never reaches the right panel (it is clamped to the card's horizontal extent)
 * and never reaches the header (it is pushed below the header's bottom edge if ever needed).
 * Its width is capped at card width - 2 * BAR_CARD_GUTTER, so it cannot be wider than the card.
 */

export type Rect = { left: number; right: number; top: number; bottom: number };

export type NarrateBarPlacement = {
  left: number;
  top: number;
  /** Applied as the bar's max-width. Only the transcript text is allowed to truncate inside it. */
  maxWidth: number;
  /** False when the bar's box still overlaps the header or one of the avoided rects. */
  clear: boolean;
};

/** Gap between the bar's bottom edge and the composer's top edge. */
export const BAR_GAP = 14;
/** Horizontal gutter kept between the bar and the main card's side edges. */
export const BAR_CARD_GUTTER = 16;

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function narrateBarPlacement(o: {
  card: Rect | null;
  composerTop: number | null;
  viewportW: number;
  viewportH: number;
  barW: number;
  barH: number;
  header?: Rect | null;
  /** Other on-screen rects the bar should stay clear of, such as thread messages. */
  avoid?: Rect[];
}): NarrateBarPlacement {
  // Without a card the bar uses the viewport, so it sits at the bottom centre of the window.
  const area: Rect = o.card ?? { left: 0, right: o.viewportW, top: 0, bottom: o.viewportH };
  const maxWidth = Math.max(0, area.right - area.left - 2 * BAR_CARD_GUTTER);
  const width = Math.min(o.barW, maxWidth);

  const minLeft = area.left + BAR_CARD_GUTTER;
  const maxLeft = Math.max(minLeft, area.right - BAR_CARD_GUTTER - width);
  const left = clamp((area.left + area.right) / 2 - width / 2, minLeft, maxLeft);

  // Above the composer; without a measurable composer, at the card's (or viewport's) bottom edge.
  const bottomEdge = o.composerTop ?? area.bottom;
  const minTop = area.top + BAR_GAP;
  const maxTop = Math.max(minTop, area.bottom - o.barH);
  let top = clamp(bottomEdge - BAR_GAP - o.barH, minTop, maxTop);
  if (o.header) top = Math.max(top, o.header.bottom + BAR_GAP);

  const box: Rect = { left, right: left + width, top, bottom: top + o.barH };
  const clear =
    !(o.header && rectsOverlap(box, o.header)) && !(o.avoid ?? []).some((r) => rectsOverlap(box, r));
  return { left, top, maxWidth, clear };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/* ------------------------------------------------------------------ key-hint bar */

export type HintMode = "full" | "compact" | "hidden";

/** Rendered size of the key-hint bar per mode (px). The full bar lists every key; compact keeps Enter and Esc. */
export const HINT_SIZE = { full: { w: 490, h: 24 }, compact: { w: 196, h: 20 } } as const;
/** Gap between the hint bar's bottom edge and the voice bar's top edge. */
export const HINT_GAP = 8;
/** Space kept between the hint bar and anything it must not touch (thread action icons, the header). */
export const HINT_CLEARANCE = 6;
/** Below this viewport width the hint bar starts compact. */
export const COMPACT_BELOW = 900;

const inflate = (r: Rect, by: number): Rect => ({ left: r.left - by, right: r.right + by, top: r.top - by, bottom: r.bottom + by });

/**
 * Where the key-hint bar goes: docked just above the voice bar, centred on it, shifted sideways to stay inside the card.
 * It steps down full -> compact -> hidden until it clears `avoid` (the thread's action icons) and the header, so it can
 * never sit on a thread control or reach the composer (it only ever sits above the voice bar, which sits above the composer).
 */
export function hintPlacement(o: {
  bar: Rect;
  card: Rect | null;
  viewportW: number;
  avoid?: Rect[];
  header?: Rect | null;
}): { mode: HintMode; dx: number } {
  const area: Rect = o.card ?? { left: 0, right: o.viewportW, top: 0, bottom: Infinity };
  const modes: HintMode[] = o.viewportW < COMPACT_BELOW ? ["compact", "hidden"] : ["full", "compact", "hidden"];
  const cx = (o.bar.left + o.bar.right) / 2;
  for (const mode of modes) {
    if (mode === "hidden") return { mode, dx: 0 };
    const { w, h } = HINT_SIZE[mode];
    const room = area.right - area.left - 2 * BAR_CARD_GUTTER;
    if (w > room) continue;
    const left = clamp(cx - w / 2, area.left + BAR_CARD_GUTTER, area.right - BAR_CARD_GUTTER - w);
    const box: Rect = { left, right: left + w, top: o.bar.top - HINT_GAP - h, bottom: o.bar.top - HINT_GAP };
    const blocked = (o.avoid ?? []).some((r) => rectsOverlap(box, inflate(r, HINT_CLEARANCE)));
    const underHeader = o.header ? box.top < o.header.bottom + HINT_CLEARANCE : false;
    if (!blocked && !underHeader) return { mode, dx: left - (cx - w / 2) };
  }
  return { mode: "hidden", dx: 0 };
}
