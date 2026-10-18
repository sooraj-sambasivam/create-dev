import { describe, expect, it } from "vitest";
import {
  bracketPath,
  edgeAnchor,
  inkOutlinePath,
  isPrecise,
  rng,
  seedOf,
  spotlightPath,
  splitDeictic,
  threadPath,
  tickMarks,
  typedSlice,
  wobbleAmount,
} from "./ink";

const big = { x: 10, y: 20, w: 600, h: 300 };
const cell = { x: 10, y: 20, w: 80, h: 24 };

describe("seeded randomness", () => {
  it("is deterministic", () => {
    const a = rng(7);
    const b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seedOf("node-1")).toBe(seedOf("node-1"));
    expect(seedOf("node-1")).not.toBe(seedOf("node-2"));
  });
});

describe("ink outline", () => {
  it("is the same for the same seed and differs between seeds", () => {
    expect(inkOutlinePath(big, 1)).toBe(inkOutlinePath(big, 1));
    expect(inkOutlinePath(big, 1)).not.toBe(inkOutlinePath(big, 2));
  });

  it("has no wobble on small targets (precision mode)", () => {
    expect(isPrecise(cell)).toBe(true);
    expect(wobbleAmount(cell)).toBe(0);
    expect(inkOutlinePath(cell, 1)).toBe(inkOutlinePath(cell, 99));
  });

  it("wobbles large targets, within 2.5px", () => {
    expect(wobbleAmount(big)).toBeGreaterThan(0);
    expect(wobbleAmount({ x: 0, y: 0, w: 5000, h: 5000 })).toBe(2.5);
  });

  it("stays near the box", () => {
    const nums = (inkOutlinePath(big, 5).match(/-?\d+\.\d/g) ?? []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(big.x - 4);
    expect(Math.max(...xs)).toBeLessThanOrEqual(big.x + big.w + 4);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(big.y - 4);
    expect(Math.max(...ys)).toBeLessThanOrEqual(big.y + big.h + 4);
  });
});

describe("brackets and spotlight", () => {
  it("draws four corners", () => {
    expect(bracketPath(big).match(/M/g)).toHaveLength(4);
  });
  it("clamps arms on tiny boxes", () => {
    expect(bracketPath({ x: 0, y: 0, w: 9, h: 9 }, 40)).toContain("V0");
  });
  it("cuts a hole only when there is a target", () => {
    expect(spotlightPath({ w: 100, h: 100 }, null)).toBe("M0 0H100.0V100.0H0Z");
    expect(spotlightPath({ w: 100, h: 100 }, { x: 10, y: 10, w: 20, h: 20 }).match(/M/g)).toHaveLength(2);
  });
});

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
