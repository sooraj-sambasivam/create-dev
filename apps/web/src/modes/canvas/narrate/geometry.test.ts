import { describe, expect, it } from "vitest";
import { clientToPage, createPathRecorder, rectFromPoints, rectsIntersect } from "./geometry";

describe("clientToPage", () => {
  // container at client (100, 50), camera at page (10, 20), zoom 2
  const screenToPage = (p: { x: number; y: number }) => ({ x: (p.x - 100) / 2 + 10, y: (p.y - 50) / 2 + 20 });
  it("converts client coords to page coords with camera and offset", () => {
    expect(clientToPage(screenToPage, 100, 50)).toEqual({ x: 10, y: 20 });
    expect(clientToPage(screenToPage, 301, 151)).toEqual({ x: 110.5, y: 70.5 });
  });
});

describe("rects", () => {
  it("normalises drag direction", () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 4, y: 5 })).toEqual({ x: 4, y: 5, w: 6, h: 15 });
  });
  it("intersects", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
  });
});

describe("createPathRecorder", () => {
  it("throttles to ~30Hz and skips unchanged samples", () => {
    const r = createPathRecorder(30);
    expect(r.add(0, { x: 1, y: 1 }, null)).toBe(true);
    expect(r.add(10, { x: 2, y: 2 }, null)).toBe(false);
    expect(r.add(40, { x: 1, y: 1 }, null)).toBe(false);
    expect(r.add(80, { x: 3, y: 3 }, "a")).toBe(true);
    expect(r.points.map((p) => p.t)).toEqual([0, 80]);
  });
  it("caps the stored points", () => {
    const r = createPathRecorder(30, 2);
    r.add(0, { x: 0, y: 0 }, null);
    r.add(100, { x: 1, y: 0 }, null);
    expect(r.add(200, { x: 2, y: 0 }, null)).toBe(false);
  });
});
