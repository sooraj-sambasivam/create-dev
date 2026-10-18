import { describe, expect, it } from "vitest";
import { QUALITY_STEPS, dataUrlBytes, fitSide, planAttempts } from "./image";

describe("fitSide", () => {
  it("keeps small images", () => {
    expect(fitSide(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
  it("scales the longest side down and keeps aspect", () => {
    expect(fitSide(4096, 2048, 2048)).toEqual({ width: 2048, height: 1024 });
    expect(fitSide(1000, 4000, 2000)).toEqual({ width: 500, height: 2000 });
  });
  it("never returns a zero side", () => {
    expect(fitSide(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });
});

describe("planAttempts", () => {
  it("starts at the capped size with the best quality", () => {
    const [first] = planAttempts(4000, 2000, 2048);
    expect(first).toEqual({ width: 2048, height: 1024, quality: QUALITY_STEPS[0] });
  });
  it("steps quality before size, and never grows", () => {
    const plan = planAttempts(2000, 1000, 2048);
    expect(plan.slice(0, QUALITY_STEPS.length).map((a) => a.quality)).toEqual([...QUALITY_STEPS]);
    for (let i = 1; i < plan.length; i++) expect(plan[i].width).toBeLessThanOrEqual(plan[i - 1].width);
    expect(plan[QUALITY_STEPS.length].width).toBeLessThan(plan[0].width);
  });
  it("terminates with a bounded plan", () => {
    const plan = planAttempts(100000, 100000, 2048);
    expect(plan.length).toBeGreaterThan(QUALITY_STEPS.length);
    expect(plan.length).toBeLessThan(100);
  });
  it("still offers one tier for tiny images", () => {
    expect(planAttempts(100, 100, 2048)).toHaveLength(QUALITY_STEPS.length);
  });
});

describe("dataUrlBytes", () => {
  it("counts the string as sent", () => {
    expect(dataUrlBytes("data:image/png;base64,AAAA")).toBe(26);
  });
});
