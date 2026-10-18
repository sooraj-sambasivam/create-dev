import { describe, expect, it } from "vitest";
import { duration, ease, fadeUp, listStagger, opacityOnly, originFor, popover, sharedAxis, spring, staggerDelay, STAGGER } from "./motion";

describe("motion tokens", () => {
  it("holds the agreed durations, easings and springs", () => {
    expect(duration).toEqual({ fast: 0.12, base: 0.2, slow: 0.32 });
    expect(ease.standard).toEqual([0.2, 0, 0, 1]);
    expect(ease.emphasized).toEqual([0.3, 0, 0, 1]);
    expect(ease.exit).toEqual([0.4, 0, 1, 1]);
    expect(spring.snappy).toMatchObject({ stiffness: 520, damping: 38 });
    expect(spring.gentle).toMatchObject({ stiffness: 260, damping: 30 });
    expect(spring.bouncy).toMatchObject({ stiffness: 420, damping: 22 });
    expect(STAGGER).toBe(0.024);
  });

  it("caps the stagger delay", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(2)).toBeCloseTo(0.048);
    expect(staggerDelay(100)).toBeCloseTo(staggerDelay(12));
  });

  it("only moves transform and opacity", () => {
    const allowed = new Set(["opacity", "x", "y", "scale", "transition"]);
    for (const v of [fadeUp, popover]) {
      for (const t of Object.values(v)) expect(Object.keys(t as object).every((k) => allowed.has(k))).toBe(true);
    }
  });

  it("opacityOnly drops all spatial values", () => {
    const out = opacityOnly(fadeUp) as Record<string, Record<string, unknown>>;
    expect(out.hidden).toEqual({ opacity: 0 });
    expect(out.show.y).toBeUndefined();
    expect(out.show.opacity).toBe(1);
    const axis = opacityOnly(sharedAxis) as Record<string, Record<string, unknown>>;
    expect(axis.enter.x).toBeUndefined();
    const stag = opacityOnly(listStagger) as Record<string, Record<string, unknown>>;
    expect(stag.show.transition).toEqual({ duration: 0 });
  });

  it("derives transform-origin from the menu side", () => {
    expect(originFor("up")).toBe("bottom left");
    expect(originFor("down", "right")).toBe("top right");
  });
});
