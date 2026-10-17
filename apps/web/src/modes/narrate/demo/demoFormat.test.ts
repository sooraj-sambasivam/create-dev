import { describe, expect, it } from "vitest";
import { clampPct, formatElapsed, progressPct } from "./demoFormat";

describe("formatElapsed", () => {
  it("formats seconds as m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(9)).toBe("0:09");
    expect(formatElapsed(75)).toBe("1:15");
    expect(formatElapsed(120)).toBe("2:00");
  });

  it("floors fractional seconds and treats bad input as zero", () => {
    expect(formatElapsed(59.9)).toBe("0:59");
    expect(formatElapsed(-4)).toBe("0:00");
    expect(formatElapsed(Number.NaN)).toBe("0:00");
  });
});

describe("clampPct", () => {
  it("keeps values in 0..100 and rounds", () => {
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(42.6)).toBe(43);
    expect(clampPct(140)).toBe(100);
    expect(clampPct(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("progressPct", () => {
  it("is 100 once done, regardless of steps", () => {
    expect(progressPct([], true)).toBe(100);
  });

  it("uses the highest step percentage seen, not the last one", () => {
    expect(progressPct([{ pct: 30 }, { pct: 70 }, { pct: 50 }], false)).toBe(70);
  });

  it("is 0 before any step arrives", () => {
    expect(progressPct([], false)).toBe(0);
  });

  it("clamps out-of-range step values", () => {
    expect(progressPct([{ pct: 250 }], false)).toBe(100);
  });
});
