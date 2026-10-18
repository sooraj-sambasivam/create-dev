import { describe, expect, it } from "vitest";
import { MIC_DOCK_GAP, isTopOccupied, micDock } from "./MicPill";

const base = { headerBottom: 48, composerTop: 700, viewportH: 900, pillH: 24 };

describe("micDock", () => {
  it("docks top centre, 8px below the header, when the slot is free", () => {
    expect(micDock({ ...base, topOccupied: false })).toEqual({ side: "top", top: 48 + MIC_DOCK_GAP });
  });
  it("flips to bottom centre, 8px above the composer, when the top slot is occupied", () => {
    expect(micDock({ ...base, topOccupied: true })).toEqual({ side: "bottom", top: 700 - MIC_DOCK_GAP - 24 });
  });
  it("falls back to the viewport bottom when the composer is not measurable", () => {
    expect(micDock({ ...base, composerTop: null, topOccupied: true })).toEqual({ side: "bottom", top: 900 - MIC_DOCK_GAP - 24 });
  });
  it("always starts the top slot exactly header height plus 8px", () => {
    expect(micDock({ ...base, headerBottom: 56, topOccupied: false }).top).toBe(64);
  });
});

// Structural stand-ins: the node test environment has no DOM, so only `closest` is faked.
const node = (match: string | null) => ({ closest: (sel: string) => (match !== null && sel.includes(match) ? {} : null) }) as unknown as Element;

describe("isTopOccupied", () => {
  it("is free when nothing under the slot is chrome", () => {
    expect(isTopOccupied([node(null)])).toBe(false);
  });
  it("is occupied by header, thread, or any control under the slot", () => {
    expect(isTopOccupied([node("header")])).toBe(true);
    expect(isTopOccupied([node("data-testid='thread'")])).toBe(true);
    expect(isTopOccupied([node("button")])).toBe(true);
  });
  it("ignores the pill itself", () => {
    const pill = { closest: (sel: string) => (sel.includes("data-mic-pill") ? {} : null) } as unknown as Element;
    expect(isTopOccupied([pill, node(null)])).toBe(false);
  });
});
