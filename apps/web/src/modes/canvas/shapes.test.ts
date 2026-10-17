import { describe, expect, it } from "vitest";
import { richTextToPlain, shapeText, toSummary } from "./shapes";

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
