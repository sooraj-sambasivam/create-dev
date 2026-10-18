import { describe, expect, it } from "vitest";
import { MIC_CARD_INSET, MIC_DOCK_GAP, micPlacement, type Rect } from "./MicPill";

// A 1200x900 window with the main card inset 8px from the sidebar edge, right, top and bottom.
const card: Rect = { left: 268, right: 1192, top: 8, bottom: 892 };
const base = { card, composerTop: 700, viewportW: 1200, viewportH: 900, pillW: 90, pillH: 24 };

describe("micPlacement", () => {
  it("centres the pill horizontally on the main card", () => {
    const { left } = micPlacement(base);
    expect(left).toBe((268 + 1192) / 2 - 45);
  });

  it("sits MIC_DOCK_GAP above the composer top, so it never reaches the thread header or the right panel", () => {
    expect(micPlacement(base).top).toBe(700 - MIC_DOCK_GAP - 24);
  });

  it("stays inside the card's horizontal extent, clear of the right panel", () => {
    const { left } = micPlacement({ ...base, pillW: 90 });
    expect(left).toBeGreaterThanOrEqual(card.left + MIC_CARD_INSET);
    expect(left + 90).toBeLessThanOrEqual(card.right - MIC_CARD_INSET);
  });

  it("clamps a pill wider than the card's narrow side to the card's inset", () => {
    const narrow: Rect = { left: 100, right: 160, top: 8, bottom: 892 };
    const { left } = micPlacement({ ...base, card: narrow, pillW: 200 });
    expect(left).toBe(100 + MIC_CARD_INSET);
  });

  it("falls back to the card's bottom edge when the composer is not measurable", () => {
    expect(micPlacement({ ...base, composerTop: null }).top).toBe(892 - MIC_DOCK_GAP - 24);
  });

  it("falls back to the viewport bottom centre when there is no card", () => {
    expect(micPlacement({ ...base, card: null, composerTop: null })).toEqual({
      left: 600 - 45,
      top: 900 - MIC_DOCK_GAP - 24,
    });
  });

  it("keeps the pill inside the card's top edge when the composer is pushed to the top", () => {
    const { top } = micPlacement({ ...base, composerTop: 0 });
    expect(top).toBe(card.top + MIC_CARD_INSET);
  });
});
