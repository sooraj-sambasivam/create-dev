import { describe, expect, it } from "vitest";
import { ACTIONS, actionAt, actionNote, moveSelection } from "./pointerActions";
import { keyHints } from "./KeyHintBar";

describe("action card", () => {
  it("offers the four actions with Understand first", () => {
    expect(ACTIONS.map((a) => a.title)).toEqual(["Understand", "Transform", "Make this a live app I own", "Keep"]);
    expect(actionAt(0).id).toBe("understand");
  });
  it("keeps every hint within a chip", () => {
    expect(ACTIONS.every((a) => a.hint.length <= 45)).toBe(true);
  });
  it("wraps the selection both ways", () => {
    expect(moveSelection(3, "ArrowDown")).toBe(0);
    expect(moveSelection(0, "ArrowUp")).toBe(3);
    expect(moveSelection(1, "ArrowDown")).toBe(2);
  });
  it("clamps an out-of-range index", () => {
    expect(actionAt(99).id).toBe("keep");
    expect(actionAt(-3).id).toBe("understand");
  });
  it("writes a note for the narration", () => {
    expect(actionNote("app", "Table · Stops")).toContain("live app");
    expect(actionNote("keep", "")).toContain("pointed-at");
  });
});

describe("key hints", () => {
  it("switch Enter from finish to act when something is pinned", () => {
    expect(keyHints({ pinned: false }).find((h) => h.key === "↵")?.label).toBe("finish");
    expect(keyHints({ pinned: true }).find((h) => h.key === "↵")?.label).toBe("act on it");
    expect(keyHints({ pinned: true }).find((h) => h.key === "esc")?.label).toBe("release");
  });
});
