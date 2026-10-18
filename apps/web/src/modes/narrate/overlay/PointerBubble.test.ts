import { describe, expect, it } from "vitest";
import { chipPosition } from "./PointerBubble";

const viewport = { w: 1000, h: 800 };
const chip = { w: 120, h: 24 };

describe("chipPosition", () => {
  it("sits just above the element's top-left", () => {
    const p = chipPosition({ el: { left: 100, top: 200, width: 300, height: 40 }, cursor: { x: 150, y: 220 }, chip, viewport });
    expect(p).toEqual({ x: 98, y: 200 - 2 - 6 - 24 });
  });
  it("goes below when there is no room above", () => {
    const p = chipPosition({ el: { left: 100, top: 10, width: 300, height: 40 }, cursor: { x: 150, y: 20 }, chip, viewport });
    expect(p.y).toBe(10 + 40 + 2 + 6);
  });
  it("stays inside the viewport horizontally", () => {
    expect(chipPosition({ el: { left: 950, top: 300, width: 40, height: 20 }, cursor: { x: 960, y: 310 }, chip, viewport }).x).toBe(1000 - 120 - 8);
  });
  it("follows the cursor with no element", () => {
    expect(chipPosition({ el: null, cursor: { x: 50, y: 60 }, chip, viewport })).toEqual({ x: 64, y: 74 });
  });
});
