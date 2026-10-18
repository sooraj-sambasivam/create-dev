import { describe, expect, it } from "vitest";
import type { StoredSubmission } from "@create/shared";
import { fieldForColumn, mapRows, mergeChart, parseNumber, submissionsForForm } from "./liveRows";

const sub = (id: string, fields: Record<string, string>, createdAt = "2026-01-01T00:00:0" + id + "Z", formId = "f"): StoredSubmission => ({
  id,
  appId: "a",
  formId,
  fields,
  createdAt,
});

describe("parseNumber", () => {
  it.each([
    ["$1,234.50", 1234.5],
    ["12%", 12],
    ["(40)", -40],
    ["-3", -3],
    ["3.2k", 3200],
    ["1.5M", 1500000],
    [" 7 ", 7],
  ])("%s", (raw, want) => expect(parseNumber(raw)).toBe(want));
  it.each(["", "abc", "12 apples", "1.2.3", null, undefined])("rejects %s", (raw) => expect(parseNumber(raw)).toBeNull());
});

describe("mapRows", () => {
  it("matches columns by label, slug and case; drops unrelated submissions", () => {
    const rows = mapRows(["Item", "Unit Price"], [sub("1", { item: "Mocha", unit_price: "$5" }), sub("2", { other: "x" }), sub("3", { Item: "Tea" })]);
    expect(rows).toEqual([
      { id: "1", cells: ["Mocha", "$5"] },
      { id: "3", cells: ["Tea", ""] },
    ]);
  });
  it("fieldForColumn is case-insensitive", () => expect(fieldForColumn({ WEEK: "3" }, "week")).toBe("3"));
});

describe("submissionsForForm", () => {
  it("filters by form and sorts oldest first", () => {
    const out = submissionsForForm([sub("2", {}), sub("1", {}), sub("3", {}, undefined, "other")], "f");
    expect(out.map((s) => s.id)).toEqual(["1", "2"]);
  });
});

describe("mergeChart", () => {
  const base = { labels: ["W1"], series: [{ name: "Orders", values: [5] }] };
  it("appends label and named series value", () => {
    const out = mergeChart(base, [sub("1", { week: "W2", orders: "12" })]);
    expect(out.labels).toEqual(["W1", "W2"]);
    expect(out.series[0]?.values).toEqual([5, 12]);
  });
  it("falls back to the next numeric field and parses money", () => {
    const out = mergeChart(base, [sub("1", { name: "W2", amount: "$1,200" })]);
    expect(out.series[0]?.values).toEqual([5, 1200]);
  });
  it("skips submissions without numbers and does not mutate the base", () => {
    const out = mergeChart(base, [sub("1", { note: "hi" })]);
    expect(out.labels).toEqual(["W1"]);
    expect(base.series[0]?.values).toEqual([5]);
  });
});
