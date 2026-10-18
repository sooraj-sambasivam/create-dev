import { describe, expect, it } from "vitest";
import { NodeSchema, ScreenSchema, walkNodes } from "@create/shared";
import { SECTION_TEMPLATES } from "./templates";
import { planInsert } from "./insert";

describe("section templates", () => {
  it("has the eight sections", () => {
    expect(SECTION_TEMPLATES.map((t) => t.id)).toEqual(["hero", "features", "pricing", "testimonials", "faq", "cta", "footer", "contact"]);
  });
  for (const t of SECTION_TEMPLATES) {
    it(`${t.id} parses against NodeSchema`, () => {
      for (const n of t.nodes) expect(NodeSchema.safeParse(n).success).toBe(true);
    });
    it(`${t.id} has unique ids`, () => {
      const ids: string[] = [];
      walkNodes(t.nodes, (n) => ids.push(n.id));
      expect(new Set(ids).size).toBe(ids.length);
    });
  }
  it("ids are unique across templates", () => {
    const ids: string[] = [];
    for (const t of SECTION_TEMPLATES) walkNodes(t.nodes, (n) => ids.push(n.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("planInsert", () => {
  const screen = ScreenSchema.parse({
    title: "T",
    children: [
      { id: "a", type: "heading", text: "A" },
      { id: "box", type: "container", children: [{ id: "b", type: "text", text: "B" }] },
    ],
  });
  it("appends with no selection", () => expect(planInsert(screen, null)).toEqual({ parentId: null }));
  it("inserts after a selected leaf", () => expect(planInsert(screen, "a")).toEqual({ parentId: null, index: 1 }));
  it("inserts after a nested leaf in its parent", () => expect(planInsert(screen, "b")).toEqual({ parentId: "box", index: 1 }));
  it("inserts inside a selected container", () => expect(planInsert(screen, "box")).toEqual({ parentId: "box" }));
});
