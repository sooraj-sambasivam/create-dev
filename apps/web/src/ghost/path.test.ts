import { describe, expect, it } from "vitest";
import { bezierAt, easeInOutCubic, glideDuration, makePath, pointAtTime } from "./path";

describe("easeInOutCubic", () => {
  it("hits the endpoints and midpoint", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });
  it("is monotonic, slow at both ends, and clamps", () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = easeInOutCubic(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
    expect(easeInOutCubic(-3)).toBe(0);
    expect(easeInOutCubic(7)).toBe(1);
  });
});

describe("bezier path", () => {
  const a = { x: 10, y: 10 };
  const b = { x: 410, y: 210 };
  it("starts and ends exactly at the endpoints", () => {
    const p = makePath(a, b);
    expect(bezierAt(p, 0)).toEqual(a);
    const end = bezierAt(p, 1);
    expect(end.x).toBeCloseTo(b.x);
    expect(end.y).toBeCloseTo(b.y);
    expect(pointAtTime(p, 0)).toEqual(a);
  });
  it("arcs off the straight line", () => {
    const p = makePath(a, b);
    const m = bezierAt(p, 0.5);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.abs(dy * (m.x - a.x) - dx * (m.y - a.y)) / Math.hypot(dx, dy);
    expect(dist).toBeGreaterThan(5);
  });
  it("handles a zero-length hop", () => {
    const p = makePath(a, a);
    expect(bezierAt(p, 0.5)).toEqual(a);
  });
  it("scales glide time with distance within bounds", () => {
    expect(glideDuration(a, a)).toBe(280);
    expect(glideDuration(a, { x: 5000, y: 0 })).toBe(1100);
    expect(glideDuration(a, { x: 310, y: 10 })).toBeGreaterThan(glideDuration(a, { x: 110, y: 10 }));
  });
});
