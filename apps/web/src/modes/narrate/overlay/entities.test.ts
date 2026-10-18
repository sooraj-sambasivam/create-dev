import { describe, expect, it } from "vitest";
import { deriveEntities, entityLine, findPrice, groupEntities } from "./entities";

const tree = [
  {
    id: "root",
    type: "container",
    children: [
      { id: "h1", type: "heading", text: "Route 44 schedule" },
      { id: "p1", type: "text", text: "Fares start at $2.75 per ride" },
      { id: "p2", type: "text", text: "No prices here" },
      { id: "img1", type: "image", alt: "A bus at the harbor stop", query: "bus" },
      {
        id: "box",
        type: "container",
        children: [
          { id: "t1", type: "table", columns: ["Stop", "Time", "Zone", "Fare"], rows: Array.from({ length: 12 }, () => ["a", "b", "c", "d"]) },
          { id: "d1", type: "data", format: "currency", label: "Revenue today", source: {}, field: "x" },
          { id: "d2", type: "data", format: "number", source: {}, field: "y" },
          { id: "b1", type: "badge", label: "€12,50 EUR" },
        ],
      },
    ],
  },
];

describe("findPrice", () => {
  it("finds symbols and codes", () => {
    expect(findPrice("Only $12.50 today")).toBe("$12.50");
    expect(findPrice("£1,299")).toBe("£1,299");
    expect(findPrice("12.50 USD")).toBe("12.50 USD");
    expect(findPrice("Route 44")).toBeNull();
    expect(findPrice("")).toBeNull();
  });
});

describe("deriveEntities", () => {
  const list = deriveEntities(tree);

  it("lists tables, prices, images and headings in page order", () => {
    expect(list.map((e) => [e.id, e.kind])).toEqual([
      ["h1", "heading"],
      ["p1", "price"],
      ["img1", "image"],
      ["t1", "table"],
      ["d1", "price"],
      ["b1", "price"],
    ]);
  });

  it("describes a table by its shape", () => {
    const t = list.find((e) => e.id === "t1")!;
    expect(entityLine(t)).toBe("Table · 12 rows × 4 cols");
  });

  it("uses the price itself as the detail", () => {
    expect(list.find((e) => e.id === "p1")!.detail).toBe("$2.75");
    expect(list.find((e) => e.id === "d1")!.detail).toBe("Revenue today");
  });

  it("skips non-currency data and plain text", () => {
    expect(list.some((e) => e.id === "d2" || e.id === "p2")).toBe(false);
  });

  it("keeps a heading as a heading", () => {
    const l = deriveEntities([{ id: "h", type: "heading", text: "Only $5 today" }]);
    expect(l).toEqual([expect.objectContaining({ kind: "heading" })]);
  });

  it("ignores nodes with no id and handles empty input", () => {
    expect(deriveEntities([{ type: "heading", text: "x" }])).toEqual([]);
    expect(deriveEntities(null)).toEqual([]);
    expect(deriveEntities([])).toEqual([]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `h${i}`, type: "heading", text: `H${i}` }));
    expect(deriveEntities(many, 10)).toHaveLength(10);
  });

  it("groups by kind in display order", () => {
    expect(groupEntities(list).map((g) => g.kind)).toEqual(["table", "price", "image", "heading"]);
  });
});
