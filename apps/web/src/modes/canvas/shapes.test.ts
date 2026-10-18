import { describe, expect, it } from "vitest";
import { libraryShapesInRegion, richTextToPlain, shapeText, toSummary } from "./shapes";

describe("shapes mapping", () => {
  it("flattens rich text blocks", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }, { type: "paragraph", content: [{ type: "text", text: "World" }] }] };
    expect(richTextToPlain(doc)).toBe("Hello\nWorld");
    expect(richTextToPlain(null)).toBe("");
  });

  it("prefers richText, then text, then name", () => {
    const rich = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "R" }] }] };
    expect(shapeText({ id: "a", type: "geo", props: { richText: rich, text: "T" } })).toBe("R");
    expect(shapeText({ id: "a", type: "text", props: { text: " T " } })).toBe("T");
    expect(shapeText({ id: "a", type: "frame", props: { name: "N" } })).toBe("N");
    expect(shapeText({ id: "a", type: "draw", props: {} })).toBeUndefined();
  });

  it("maps shape + bounds to a rounded summary", () => {
    expect(toSummary({ id: "shape:1", type: "geo", props: { text: "Btn" } }, { x: 1.4, y: 2.6, w: 100.5, h: 40.2 })).toEqual({
      id: "shape:1", type: "geo", text: "Btn", x: 1, y: 3, w: 101, h: 40,
    });
    expect(toSummary({ id: "s", type: "draw" }, undefined)).toEqual({ id: "s", type: "draw", x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("toSummary meta", () => {
  it("carries the library origin", () => {
    expect(toSummary({ id: "s", type: "image", meta: { libraryKind: "icon", value: "lucide:star" } }, { x: 0, y: 0, w: 96, h: 96 }).meta).toEqual({ icon: "lucide:star" });
    expect(toSummary({ id: "s", type: "image" }, undefined).meta).toBeUndefined();
  });
});

describe("libraryShapesInRegion", () => {
  const s = (id: string, x: number, y: number, meta?: Record<string, string>) => ({ id, type: "image", x, y, w: 100, h: 100, ...(meta ? { meta } : {}) });
  it("keeps overlapping icon/photo shapes, skipping excluded and non-library", () => {
    const all = [s("a", 50, 50, { icon: "lucide:star" }), s("b", 500, 500, { icon: "x" }), s("c", 60, 60), s("d", 0, 0, { photo: "u" })];
    const r = libraryShapesInRegion(all, { x: 0, y: 0, w: 200, h: 200 }, ["d"]);
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });
});
