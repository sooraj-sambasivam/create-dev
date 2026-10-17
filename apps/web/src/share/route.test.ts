import { afterEach, describe, expect, it, vi } from "vitest";
import { sharedIdFromLocation, sharedIdFromSearch } from "./route";

describe("sharedIdFromSearch", () => {
  it("reads the p parameter", () => {
    expect(sharedIdFromSearch("?p=abc123")).toBe("abc123");
    expect(sharedIdFromSearch("?foo=1&p=Xy_9-z")).toBe("Xy_9-z");
  });

  it("returns null when the parameter is missing or empty", () => {
    expect(sharedIdFromSearch("")).toBeNull();
    expect(sharedIdFromSearch("?q=1")).toBeNull();
    expect(sharedIdFromSearch("?p=")).toBeNull();
    expect(sharedIdFromSearch("?p=%20%20")).toBeNull();
  });

  it("rejects ids that are not URL-safe tokens", () => {
    expect(sharedIdFromSearch("?p=../etc")).toBeNull();
    expect(sharedIdFromSearch("?p=a%2Fb")).toBeNull();
    expect(sharedIdFromSearch(`?p=${"a".repeat(65)}`)).toBeNull();
    expect(sharedIdFromSearch(`?p=${"a".repeat(64)}`)).toBe("a".repeat(64));
  });

  it("trims surrounding whitespace", () => {
    expect(sharedIdFromSearch("?p=%20abc%20")).toBe("abc");
  });
});

describe("sharedIdFromLocation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads ?p= from window.location", () => {
    vi.stubGlobal("window", { location: { search: "?p=proto1" } });
    expect(sharedIdFromLocation()).toBe("proto1");
  });

  it("returns null when there is no shared id", () => {
    vi.stubGlobal("window", { location: { search: "" } });
    expect(sharedIdFromLocation()).toBeNull();
  });

  it("returns null without a window (server or test environment)", () => {
    vi.stubGlobal("window", undefined);
    expect(sharedIdFromLocation()).toBeNull();
  });
});
