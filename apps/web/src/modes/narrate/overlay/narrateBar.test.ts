import { describe, expect, it } from "vitest";
import { BAR_CARD_GUTTER, BAR_GAP, narrateBarPlacement, rectsOverlap, type Rect } from "./narrateBar";

// A 1200x900 window. The sidebar ends at x=268; the main card runs from there to the right panel's
// slot at x=1000, with the header across the top and the composer near the bottom.
const card: Rect = { left: 268, right: 1000, top: 8, bottom: 892 };
const header: Rect = { left: 268, right: 1000, top: 8, bottom: 60 };
const composer: Rect = { left: 300, right: 968, top: 760, bottom: 860 };
const thread: Rect = { left: 268, right: 1000, top: 60, bottom: 752 };
const msgs: Rect[] = [
  { left: 400, right: 868, top: 100, bottom: 180 },
  { left: 400, right: 868, top: 200, bottom: 300 },
  { left: 400, right: 868, top: 620, bottom: 700 },
];
const base = {
  card,
  composerTop: composer.top,
  viewportW: 1200,
  viewportH: 900,
  barW: 240,
  barH: 32,
  header,
  avoid: msgs,
};

describe("narrateBarPlacement", () => {
  it("centres the bar horizontally on the main card", () => {
    const { left } = narrateBarPlacement(base);
    expect(left).toBe((card.left + card.right) / 2 - 120);
  });

  it("sits BAR_GAP above the composer, inside the card", () => {
    const p = narrateBarPlacement(base);
    expect(p.top).toBe(composer.top - BAR_GAP - 32);
  });

  it("caps max-width at card width minus the 16px gutter on each side", () => {
    const p = narrateBarPlacement({ ...base, barW: 5000 });
    expect(p.maxWidth).toBe(card.right - card.left - 2 * BAR_CARD_GUTTER);
    expect(p.maxWidth).toBe(700);
  });

  it("uses the bar's natural width when it is narrower than the max-width", () => {
    const p = narrateBarPlacement(base);
    expect(p.maxWidth).toBe(700);
    expect(p.left).toBe(634 - 120);
  });

  it("keeps a too-wide bar inside the card's gutters, clear of the right panel", () => {
    const p = narrateBarPlacement({ ...base, barW: 5000 });
    expect(p.left).toBe(card.left + BAR_CARD_GUTTER);
    expect(p.left + p.maxWidth).toBeLessThanOrEqual(card.right - BAR_CARD_GUTTER);
  });

  it("does not overlap the header or the right panel for a normal bar", () => {
    const p = narrateBarPlacement(base);
    const box = { left: p.left, right: p.left + 240, top: p.top, bottom: p.top + 32 };
    expect(rectsOverlap(box, header)).toBe(false);
    expect(box.right).toBeLessThanOrEqual(card.right);
    expect(p.clear).toBe(true);
  });

  it("reports clear=true with no avoided rects", () => {
    expect(narrateBarPlacement({ ...base, avoid: [] }).clear).toBe(true);
  });

  it("reports the overlap when the whole thread box is passed, since it reaches down to the composer", () => {
    expect(narrateBarPlacement({ ...base, avoid: [thread] }).clear).toBe(false);
  });

  it("reports clear=true when the thread's messages end above the bar", () => {
    const p = narrateBarPlacement({ ...base, avoid: msgs.slice(0, 2) });
    expect(p.clear).toBe(true);
  });

  it("flags a message that sits under the bar", () => {
    const p = narrateBarPlacement({ ...base, avoid: [{ left: 400, right: 868, top: 700, bottom: 740 }] });
    expect(p.clear).toBe(false);
  });

  it("is pushed below the header when the composer is too high to leave room above it", () => {
    const p = narrateBarPlacement({ ...base, composerTop: 70 });
    expect(p.top).toBeGreaterThanOrEqual(header.bottom + BAR_GAP);
  });

  it("falls back to the card's bottom edge when the composer is not measurable", () => {
    expect(narrateBarPlacement({ ...base, composerTop: null }).top).toBe(card.bottom - BAR_GAP - 32);
  });

  it("falls back to the viewport bottom centre when there is no card", () => {
    const p = narrateBarPlacement({ ...base, card: null, composerTop: null, header: null, avoid: [] });
    expect(p).toEqual({ left: 600 - 120, top: 900 - BAR_GAP - 32, maxWidth: 1200 - 2 * BAR_CARD_GUTTER, clear: true });
  });
});

describe("rectsOverlap", () => {
  it("treats touching edges as no overlap", () => {
    expect(rectsOverlap({ left: 0, right: 10, top: 0, bottom: 10 }, { left: 10, right: 20, top: 0, bottom: 10 })).toBe(false);
  });
  it("detects a real overlap", () => {
    expect(rectsOverlap({ left: 0, right: 10, top: 0, bottom: 10 }, { left: 5, right: 20, top: 5, bottom: 20 })).toBe(true);
  });
});
