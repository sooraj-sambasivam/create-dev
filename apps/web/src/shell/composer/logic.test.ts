import { describe, expect, it } from "vitest";
import { applyMention, fanOffset, pickFanDir, filterMentions, mentionQuery, placeholderFor, isStoreBusy, isDeictic, routesToSelection } from "./logic";
import { useComposerSettings } from "./settings";

describe("mentions", () => {
  it("detects a trailing @query", () => {
    expect(mentionQuery("make it like @Lo")).toBe("lo");
    expect(mentionQuery("@")).toBe("");
    expect(mentionQuery("hello")).toBeNull();
    expect(mentionQuery("a@b.com")).toBeNull();
    expect(mentionQuery("@logo.png done")).toBeNull();
  });
  it("filters and applies", () => {
    expect(filterMentions(["Logo.png", "hero.jpg"], "lo")).toEqual(["Logo.png"]);
    expect(filterMentions(["a"], null)).toEqual([]);
    expect(applyMention("use @lo", "logo.png")).toBe("use @logo.png ");
    expect(applyMention("@", "a.png")).toBe("@a.png ");
  });
});

describe("fan + placeholder", () => {
  it("arcs to the right of Go, or above it to the left", () => {
    for (let i = 0; i < 3; i++) {
      expect(fanOffset(i, "right").x).toBeGreaterThan(0);
      expect(fanOffset(i, "left").y).toBeLessThan(0);
    }
    expect(fanOffset(0, "right").y).toBeLessThan(0);
    expect(fanOffset(0, "left").y).toBeLessThan(0);
  });
  it("keeps even spacing in both directions", () => {
    for (const dir of ["right", "left"] as const) {
      const d01 = Math.hypot(fanOffset(0, dir).x - fanOffset(1, dir).x, fanOffset(0, dir).y - fanOffset(1, dir).y);
      const d12 = Math.hypot(fanOffset(1, dir).x - fanOffset(2, dir).x, fanOffset(1, dir).y - fanOffset(2, dir).y);
      expect(Math.abs(d01 - d12)).toBeLessThanOrEqual(2);
    }
  });
  it("mirrors left only when the right is cramped", () => {
    expect(pickFanDir(100, 400, 0)).toBe("right");
    expect(pickFanDir(380, 400, 0)).toBe("left");
    expect(pickFanDir(20, 60, 0)).toBe("right");
  });
  it("spaces the bubbles evenly with a clear gap", () => {
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    const d01 = dist(fanOffset(0), fanOffset(1));
    const d12 = dist(fanOffset(1), fanOffset(2));
    expect(Math.abs(d01 - d12)).toBeLessThanOrEqual(2);
    expect(Math.min(d01, d12)).toBeGreaterThanOrEqual(32 + 20);
  });
  it("placeholder", () => {
    expect(placeholderFor(false)).toBe("Work with Create");
    expect(placeholderFor(true)).toBe("Describe a change…");
  });
});

describe("settings", () => {
  it("toggles and creates projects", () => {
    const s = useComposerSettings.getState();
    s.toggleConnector("gmail");
    expect(useComposerSettings.getState().connectors.gmail).toBe(true);
    s.createProject("  Demo ");
    const st = useComposerSettings.getState();
    expect(st.projects.at(-1)?.name).toBe("Demo");
    expect(st.projectId).toBe(st.projects.at(-1)?.id);
    s.createProject("   ");
    expect(useComposerSettings.getState().projects.length).toBe(st.projects.length);
  });
});

describe("deictic routing", () => {
  it("flags pointing words only as whole words", () => {
    expect(isDeictic("make this bigger")).toBe(true);
    expect(isDeictic("Swap that photo")).toBe(true);
    expect(isDeictic("fix it")).toBe(true);
    expect(isDeictic("add a pricing section")).toBe(false);
    expect(isDeictic("a bright thistle palette")).toBe(false);
  });
  it("routes to the selection only when something is selected", () => {
    expect(routesToSelection("make this bigger", "n1")).toBe(true);
    expect(routesToSelection("make this bigger", null)).toBe(false);
    expect(routesToSelection("add a footer", "n1")).toBe(false);
  });
});
