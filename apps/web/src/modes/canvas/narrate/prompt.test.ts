import { describe, expect, it } from "vitest";
import { buildPrompt, describeTarget, type TargetInfo } from "./prompt";

const shapes: Record<string, TargetInfo> = {
  "shape:1": { id: "shape:1", type: "geo", geo: "rectangle", text: "Hero" },
  "shape:2": { id: "shape:2", type: "text", text: "Sign up" },
  "shape:3": { id: "shape:3", type: "draw" },
};
const info = (id: string) => shapes[id];

describe("describeTarget", () => {
  it("names geo shapes by their geo kind", () => {
    expect(describeTarget(shapes["shape:1"])).toBe("rect 'Hero' (id shape:1)");
    expect(describeTarget(shapes["shape:3"])).toBe("draw (id shape:3)");
  });
  it("shortens long labels", () => {
    expect(describeTarget({ id: "x", type: "text", text: "a".repeat(60) })).toContain("…");
  });
});

describe("buildPrompt", () => {
  it("annotates utterances with what was pointed at", () => {
    const p = buildPrompt(
      [
        { start: 0, end: 1, text: "make this a big headline with a signup button", targetIds: ["shape:1"] },
        { start: 2, end: 3, text: "and put this under it", targetIds: ["shape:2", "shape:3"] },
        { start: 4, end: 5, text: "keep it clean", targetIds: [] },
      ],
      info,
    );
    expect(p).toBe(
      [
        "[pointing at rect 'Hero' (id shape:1)] make this a big headline with a signup button",
        "[pointing at text 'Sign up' (id shape:2), draw (id shape:3)] and put this under it",
        "keep it clean",
      ].join("\n"),
    );
  });
  it("skips unknown ids and empty text", () => {
    expect(buildPrompt([{ start: 0, end: 1, text: "hi", targetIds: ["nope"] }, { start: 1, end: 2, text: " ", targetIds: [] }], info)).toBe("hi");
  });
  it("drops oldest lines to fit the limit", () => {
    const u = [0, 1, 2].map((i) => ({ start: i, end: i, text: `line${i} ${"x".repeat(40)}`, targetIds: [] }));
    const p = buildPrompt(u, info, 100);
    expect(p.length).toBeLessThanOrEqual(100);
    expect(p).toContain("line2");
    expect(p).not.toContain("line0");
  });
});
