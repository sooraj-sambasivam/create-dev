import { describe, expect, it } from "vitest";
import { edgeAnchor, roundedRect, splitDeictic, threadPath, tickMarks, typedSlice } from "./ink";

const big = { x: 10, y: 20, w: 600, h: 300 };

describe("thread", () => {
  it("lands on the nearest edge, never inside the box", () => {
    expect(edgeAnchor(big, { x: 5, y: 100 })).toEqual({ x: 10, y: 100 });
    expect(edgeAnchor(big, { x: 100, y: 0 })).toEqual({ x: 100, y: 20 });
    expect(edgeAnchor(big, { x: 100, y: 25 })).toEqual({ x: 100, y: 20 });
  });
  it("arcs upward", () => {
    const d = threadPath({ x: 0, y: 100 }, { x: 200, y: 100 });
    const cy = Number(/Q\S+ (\S+)/.exec(d)![1]);
    expect(cy).toBeLessThan(100);
  });
});

describe("text helpers", () => {
  it("types on at a steady rate", () => {
    expect(typedSlice("12 rows", 0)).toBe("");
    expect(typedSlice("12 rows", 18 * 3)).toBe("12 ");
    expect(typedSlice("12 rows", 9999)).toBe("12 rows");
  });
  it("splits around this", () => {
    expect(splitDeictic("make this bigger")).toEqual(["make ", "this", " bigger"]);
    expect(splitDeictic("hello")).toBeNull();
  });
  it("places ticks inside the box", () => {
    const t = tickMarks({ x: 0, y: 0, w: 100, h: 100 }, 40);
    expect(t.top).toEqual([40, 80]);
    expect(t.left).toEqual([40, 80]);
  });
});
