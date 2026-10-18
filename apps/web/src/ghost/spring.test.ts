import { describe, expect, it } from "vitest";
import { atRest, expApproach, springStep, tiltFor } from "./spring";

function run(target: number, ms: number, fps: number) {
  let s = { x: 0, v: 0 };
  let peak = 0;
  for (let t = 0; t < ms; t += 1000 / fps) {
    s = springStep(s, target, 1 / fps);
    peak = Math.max(peak, s.x);
  }
  return { s, peak };
}

describe("springStep", () => {
  it("settles on the target with a small overshoot", () => {
    const { s, peak } = run(100, 1500, 60);
    expect(atRest(s, 100)).toBe(true);
    expect(peak).toBeGreaterThan(100);
    expect(peak).toBeLessThan(108);
  });
  it("behaves the same at 30, 60 and 144 fps", () => {
    const a = run(100, 400, 30).s.x;
    const b = run(100, 400, 60).s.x;
    const c = run(100, 400, 144).s.x;
    expect(Math.abs(a - b)).toBeLessThan(2);
    expect(Math.abs(c - b)).toBeLessThan(2);
  });
  it("survives a long frame without blowing up", () => {
    const s = springStep({ x: 0, v: 0 }, 100, 5);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(200);
  });
});

describe("tiltFor and expApproach", () => {
  it("leans into the move and caps", () => {
    expect(tiltFor(800)).toBe(5);
    expect(tiltFor(-100000)).toBe(-9);
    expect(tiltFor(0)).toBe(0);
  });
  it("approaches at a frame-rate independent pace", () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = expApproach(a, 1, 1 / 60, 0.1);
    let b = 0;
    for (let i = 0; i < 30; i++) b = expApproach(b, 1, 1 / 30, 0.1);
    expect(Math.abs(a - b)).toBeLessThan(1e-9);
    expect(expApproach(0, 1, 1, 0)).toBe(1);
  });
});
