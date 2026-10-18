import { describe, expect, it } from "vitest";
import { LAYOUT_CARD_MIN, planRightPanelLayout } from "./rightPanel/rightPanelStore";

const base = { sidebarWidth: 260, sidebarRail: 56, panelWidth: 640, open: true };
const plan = (rowWidth: number, over: Partial<typeof base> = {}) => planRightPanelLayout({ ...base, ...over, rowWidth });
/** Width left for the card: row minus sidebar, panel slot and the two gutters. */
const cardWidth = (row: number, r: ReturnType<typeof plan>) => row - (r.collapseSidebar ? 56 : 260) - 8 - r.panelWidth - 8;

describe("planRightPanelLayout", () => {
  it("keeps the sidebar and the wanted width when both fit", () => {
    const r = plan(1440, { panelWidth: 720 });
    expect(r).toEqual({ collapseSidebar: false, panelWidth: 720 });
    expect(cardWidth(1440, r)).toBeGreaterThanOrEqual(LAYOUT_CARD_MIN);
  });
  it("folds the sidebar to its rail before shrinking the panel", () => {
    const r = plan(1280);
    expect(r).toEqual({ collapseSidebar: true, panelWidth: 640 });
    expect(cardWidth(1280, r)).toBeGreaterThanOrEqual(LAYOUT_CARD_MIN);
  });
  it("then caps the panel so the card keeps its minimum", () => {
    const r = plan(1000, { panelWidth: 700 });
    expect(r.collapseSidebar).toBe(true);
    expect(r.panelWidth).toBe(1000 - 56 - 8 - LAYOUT_CARD_MIN - 8);
    expect(cardWidth(1000, r)).toBe(LAYOUT_CARD_MIN);
  });
  it("never goes below the panel minimum", () => {
    expect(plan(700).panelWidth).toBe(420);
  });
  it("a wanted width above 70% of the row is capped", () => {
    expect(plan(1920, { panelWidth: 5000 }).panelWidth).toBe(1344);
  });
  it("closed or unmeasured", () => {
    expect(plan(1280, { open: false })).toEqual({ collapseSidebar: false, panelWidth: 0 });
    expect(plan(0)).toEqual({ collapseSidebar: false, panelWidth: 640 });
  });
});
