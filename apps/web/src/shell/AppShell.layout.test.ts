import { describe, expect, it } from "vitest";
import { planOutputLayout } from "./AppShell";

const base = { sidebarWidth: 260, outputWidth: 480, open: true };

describe("planOutputLayout", () => {
  it("keeps the sidebar when the card still fits", () => {
    expect(planOutputLayout({ ...base, rowWidth: 1920, cardMin: 640 })).toEqual({ collapseSidebar: false, paneWidth: 480 });
  });
  it("1280 view mode: pane shrinks, card keeps 640, no overlay", () => {
    const r = planOutputLayout({ ...base, rowWidth: 1280, cardMin: 640 });
    expect(r.collapseSidebar).toBe(false);
    expect(1280 - 260 - 8 - r.paneWidth).toBeGreaterThanOrEqual(640);
  });
  it("1440 edit mode: card keeps 900", () => {
    const r = planOutputLayout({ ...base, rowWidth: 1440, cardMin: 900 });
    expect(r.collapseSidebar).toBe(true);
    expect(1440 - 56 - 8 - r.paneWidth).toBeGreaterThanOrEqual(900);
  });
  it("never goes below the pane minimum", () => {
    expect(planOutputLayout({ ...base, rowWidth: 1100, cardMin: 900 }).paneWidth).toBe(360);
  });
  it("closed or unmeasured", () => {
    expect(planOutputLayout({ ...base, rowWidth: 1280, cardMin: 640, open: false }).paneWidth).toBe(0);
    expect(planOutputLayout({ ...base, rowWidth: 0, cardMin: 640 }).paneWidth).toBe(480);
  });
});
