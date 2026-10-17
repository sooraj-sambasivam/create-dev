import { describe, expect, it } from "vitest";
import { narrateEntry } from "./handoff";

describe("narrateEntry", () => {
  it("starts the page overlay when there is no canvas hand-off", () => {
    expect(narrateEntry(false)).toBe("overlay");
    expect(narrateEntry(undefined)).toBe("overlay");
  });
  it("returns to canvas instead of lassoing when the hand-off flag is set", () => {
    expect(narrateEntry(true)).toBe("return-to-canvas");
  });
});
