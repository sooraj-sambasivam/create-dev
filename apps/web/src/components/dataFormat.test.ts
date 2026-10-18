import { describe, expect, it } from "vitest";
import { formatDataValue, getField } from "./dataFormat";

describe("getField", () => {
  const obj = { total: 5, stats: { count: 7, list: [{ n: "a" }] } };
  it("reads dot paths", () => {
    expect(getField(obj, "total")).toBe(5);
    expect(getField(obj, "stats.count")).toBe(7);
    expect(getField(obj, "stats.list.0.n")).toBe("a");
  });
  it("returns undefined for missing paths or non-objects", () => {
    expect(getField(obj, "stats.nope.x")).toBeUndefined();
    expect(getField(null, "a")).toBeUndefined();
    expect(getField("str", "a")).toBeUndefined();
  });
});

describe("formatDataValue", () => {
  it("text", () => {
    expect(formatDataValue("open", "text")).toBe("open");
    expect(formatDataValue(12, "text")).toBe("12");
    expect(formatDataValue(true, "text")).toBe("true");
  });
  it("number", () => {
    expect(formatDataValue(1234567, "number")).toBe((1234567).toLocaleString());
    expect(formatDataValue("42", "number")).toBe("42");
  });
  it("compact", () => {
    expect(formatDataValue(1200, "compact")).toMatch(/1\.2K/);
  });
  it("currency", () => {
    expect(formatDataValue(1234.5, "currency")).toMatch(/\$1,234\.50|1,234\.50/);
  });
  it("date from ISO and epoch ms", () => {
    expect(formatDataValue("2026-03-05T12:00:00Z", "date")).toMatch(/2026/);
    expect(formatDataValue(Date.UTC(2026, 2, 5, 12), "date")).toMatch(/2026/);
  });
  it("returns null for bad input", () => {
    for (const f of ["number", "compact", "currency", "date", "text"] as const) {
      expect(formatDataValue(undefined, f)).toBeNull();
      expect(formatDataValue(null, f)).toBeNull();
      expect(formatDataValue({ a: 1 }, f)).toBeNull();
    }
    expect(formatDataValue("abc", "number")).toBeNull();
    expect(formatDataValue(NaN, "number")).toBeNull();
    expect(formatDataValue(Infinity, "currency")).toBeNull();
    expect(formatDataValue("not a date", "date")).toBeNull();
    expect(formatDataValue("", "number")).toBeNull();
  });
});
