import { describe, expect, it } from "vitest";
import { computeDock } from "./Companion";

const vp = { w: 1400, h: 900 };
const composer = { left: 300, top: 780, right: 800, bottom: 860 };

describe("computeDock", () => {
  it("falls back to the corner without a composer", () => {
    expect(computeDock(vp, null, [])).toEqual({ right: 20, bottom: 24, collapsed: false });
  });
  it("docks above the composer's right edge", () => {
    expect(computeDock(vp, composer, [])).toEqual({ right: 608, bottom: 132, collapsed: false });
  });
  it("collapses when it would cover a right-panel control", () => {
    const pip = { left: 716, top: 692, right: 792, bottom: 768 };
    expect(computeDock(vp, composer, [{ left: 740, top: 700, right: 780, bottom: 730 }, pip]).collapsed).toBe(true);
  });
  it("stays full when panel controls are clear of it", () => {
    expect(computeDock(vp, composer, [{ left: 900, top: 700, right: 1300, bottom: 740 }]).collapsed).toBe(false);
  });
});
