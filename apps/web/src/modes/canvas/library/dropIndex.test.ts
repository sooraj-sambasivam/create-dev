import { describe, expect, it } from "vitest";
import { sectionIndexForY } from "./dropIndex";

describe("sectionIndexForY", () => {
  it("maps y proportionally and clamps", () => {
    expect(sectionIndexForY(0, 4)).toBe(0);
    expect(sectionIndexForY(900, 4)).toBe(2);
    expect(sectionIndexForY(99999, 4)).toBe(4);
    expect(sectionIndexForY(-5, 4)).toBe(0);
    expect(sectionIndexForY(500, 0)).toBe(0);
  });
});
