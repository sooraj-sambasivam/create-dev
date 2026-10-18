import { describe, expect, it } from "vitest";
import { isZoomKey, isZoomWheel } from "./pageCamera";

const k = (key: string, o: Partial<{ code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, ...o });

describe("zoom lock", () => {
  it("catches ctrl/meta wheel and pinch", () => {
    expect(isZoomWheel({ ctrlKey: true, metaKey: false })).toBe(true);
    expect(isZoomWheel({ ctrlKey: false, metaKey: true })).toBe(true);
    expect(isZoomWheel({ ctrlKey: false, metaKey: false })).toBe(false);
  });
  it("catches cmd/ctrl +, -, = and 0", () => {
    for (const key of ["+", "=", "-", "0"]) expect(isZoomKey(k(key, { metaKey: true }))).toBe(true);
    expect(isZoomKey(k("-", { ctrlKey: true }))).toBe(true);
  });
  it("catches shift+0/1/2 but not plain digits", () => {
    for (const code of ["Digit0", "Digit1", "Digit2"]) expect(isZoomKey(k(")", { code, shiftKey: true }))).toBe(true);
    expect(isZoomKey(k("1", { code: "Digit1" }))).toBe(false);
    expect(isZoomKey(k("a", { metaKey: true }))).toBe(false);
  });
});
