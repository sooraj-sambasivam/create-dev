import { describe, expect, it } from "vitest";
import { sanitizeNodes } from "./sanitize";

describe("sanitize chart", () => {
  it("pads and truncates series values to the labels length", () => {
    const out = sanitizeNodes([
      { type: "chart", labels: ["a", "b", "c"], series: [{ name: "x", values: [1] }, { name: "y", values: [1, 2, 3, 4, 5] }, { name: "z", values: ["7", null, "n"] }] },
    ]) as any[];
    expect(out[0].series.map((s: any) => s.values)).toEqual([[1, 0, 0], [1, 2, 3], [7, 0, 0]]);
  });
});
