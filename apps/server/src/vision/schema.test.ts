import { describe, expect, it } from "vitest";
import { ScreenSchema, type SketchRequest } from "@create/shared";
import { parseAbelScreen } from "./schema";

const req: SketchRequest = { image: "iVBORw0KGgo=", shapes: [] };

const screen = {
  title: "Welcome",
  accent: "#4f46e5",
  children: [{ id: "hero-title", type: "heading", text: "Welcome", level: 1 }],
};

describe("parseAbelScreen", () => {
  it("accepts an Abel screen through ScreenSchema.parse", () => {
    const out = parseAbelScreen(JSON.stringify({ summary: "Built the welcome page.", screen }), req);
    expect(ScreenSchema.parse(out.screen).title).toBe("Welcome");
    expect(out.screen.children[0]).toMatchObject({ id: "hero-title", type: "heading", text: "Welcome" });
  });

  it("accepts fenced JSON", () => {
    const out = parseAbelScreen("```json\n" + JSON.stringify({ summary: "Built it.", screen }) + "\n```", req);
    expect(out.screen.title).toBe("Welcome");
  });

  it("rejects HTML and operations instead of a screen", () => {
    expect(() => parseAbelScreen("<div>hello</div>", req)).toThrow(/JSON/);
    expect(() => parseAbelScreen(JSON.stringify({ summary: "Added a block.", operations: [{ op: "add", groupId: "g1" }] }), req)).toThrow(/screen/);
    expect(() =>
      parseAbelScreen(JSON.stringify({ summary: "nope", html: "<p>Hi</p>", screen }), req),
    ).toThrow(/innerHTML|html/);
    expect(() =>
      parseAbelScreen(
        JSON.stringify({
          summary: "nope",
          screen: { title: "T", children: [{ id: "x", type: "heading", text: "Hi", innerHTML: "<b>Hi</b>" }] },
        }),
        req,
      ),
    ).toThrow(/innerHTML|html/);
  });

  it("keeps an existing accent and style the model omitted", () => {
    const previous = ScreenSchema.parse({
      title: "Old",
      accent: "#112233",
      children: [{ id: "hero-title", type: "heading", text: "Old", level: 1, style: { color: "#abcdef" } }],
    });
    const out = parseAbelScreen(
      JSON.stringify({
        summary: "Updated the heading.",
        screen: { title: "Welcome", children: [{ id: "hero-title", type: "heading", text: "Welcome", level: 1 }] },
      }),
      { ...req, screen: previous },
    );
    expect(out.screen.accent).toBe("#112233");
    expect(out.screen.children[0]).toMatchObject({ style: { color: "#abcdef" } });
  });
});
