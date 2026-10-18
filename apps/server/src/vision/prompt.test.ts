import { describe, expect, it } from "vitest";
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt } from "./prompt";

describe("vision prompts", () => {
  it("asks for an Abel screen and forbids HTML", () => {
    const system = buildSystemPrompt();
    expect(system).toContain('{"summary","screen"}');
    expect(system).toContain("Never return HTML, innerHTML");
    expect(system).not.toContain("page_operations");
    expect(system).not.toContain("<img");
    expect(system).not.toContain('"html"');
    const user = buildUserPrompt({ image: "abc", shapes: [], prompt: "Cafe" });
    expect(user).toContain("Do not return HTML or innerHTML");
    expect(user).toContain("<sketch_shapes>");
    const repair = buildRepairPrompt("- screen.children: Required");
    expect(repair).toContain("ScreenSchema");
    expect(repair).toContain("Do not return HTML, innerHTML");
  });
});
