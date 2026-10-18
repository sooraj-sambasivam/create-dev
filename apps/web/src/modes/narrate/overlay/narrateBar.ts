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
