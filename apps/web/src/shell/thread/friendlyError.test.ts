import { describe, expect, it } from "vitest";
import { friendlyError } from "./friendlyError";

describe("friendlyError", () => {
  it("explains network failures", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/Check your connection/);
    expect(friendlyError(new Error("Load failed"))).toMatch(/Couldn't reach the server/);
  });
  it("explains 429 and 5xx", () => {
    expect(friendlyError(new Error("Generation failed (429)"))).toMatch(/Too many requests/);
    expect(friendlyError(new Error("Generation failed (503)"))).toMatch(/server had a problem/);
  });
  it("keeps server-written messages and falls back when empty", () => {
    expect(friendlyError(new Error("The prompt is too long."))).toBe("The prompt is too long.");
    expect(friendlyError(undefined)).toMatch(/Something went wrong/);
  });
});
