import { describe, expect, it } from "vitest";
import { TYPE_MS, typedCount } from "./NotesCard";

describe("typedCount", () => {
  it("types 30ms per character for short rows and never past TYPE_MS", () => {
    expect(typedCount(10, 0)).toBe(0);
    expect(typedCount(10, 90)).toBe(3);
    expect(typedCount(100, TYPE_MS)).toBe(100);
    expect(typedCount(100, TYPE_MS / 2)).toBe(50);
    expect(typedCount(0, 100)).toBe(0);
  });
});
