import { describe, expect, it } from "vitest";
import { edgeLabelRect, overlapArea, placeTooltip, type Rect } from "./tooltip";

const size = { w: 240, h: 80 };
const bounds = { w: 1000, h: 600 };
const anchor: Rect = { x: 400, y: 200, w: 200, h: 60 };

describe("placeTooltip", () => {
  it("sits beside the hovered node when the space is empty", () => {
    const p = placeTooltip({ bounds, anchor, size, obstacles: [] });
    expect(p.side).toBe("right");
    expect(p.clear).toBe(true);
    expect(p.x).toBe(anchor.x + anchor.w + 8);
    expect(p.y).toBe(anchor.y);
  });

  it("does not cover a neighbouring node on the right", () => {
    const neighbour: Rect = { x: 620, y: 180, w: 200, h: 100 };
    const p = placeTooltip({ bounds, anchor, size, obstacles: [neighbour] });
    expect(p.side).not.toBe("right");
    expect(overlapArea({ x: p.x, y: p.y, ...size }, neighbour)).toBe(0);
  });

  it("avoids edge labels", () => {
    const label = edgeLabelRect({ x: 700, y: 230 }, "prompt → page tree");
    const p = placeTooltip({ bounds, anchor, size, obstacles: [label] });
    expect(overlapArea({ x: p.x, y: p.y, ...size }, label)).toBe(0);
    expect(p.clear).toBe(true);
  });

  it("flips to the left at the right edge", () => {
    const edgeAnchor: Rect = { x: 760, y: 200, w: 200, h: 60 };
    const p = placeTooltip({ bounds, anchor: edgeAnchor, size, obstacles: [] });
    expect(p.side).toBe("left");
    expect(p.x).toBe(edgeAnchor.x - 8 - size.w);
  });

  it("flips above or below when left and right are both blocked", () => {
    const walls: Rect[] = [
      { x: 0, y: 0, w: 390, h: 600 },
      { x: 610, y: 0, w: 390, h: 600 },
    ];
    const p = placeTooltip({ bounds, anchor, size, obstacles: walls });
    expect(["below", "above"]).toContain(p.side);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + size.w).toBeLessThanOrEqual(bounds.w);
  });

  it("stays inside the bounds when nothing is clear", () => {
    const everywhere: Rect = { x: -100, y: -100, w: 2000, h: 2000 };
    const p = placeTooltip({ bounds, anchor, size, obstacles: [everywhere] });
    expect(p.clear).toBe(false);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x + size.w).toBeLessThanOrEqual(bounds.w);
    expect(p.y + size.h).toBeLessThanOrEqual(bounds.h);
  });
});
