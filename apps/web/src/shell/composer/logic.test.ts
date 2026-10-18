import { describe, expect, it } from "vitest";
import { applyMention, fanOffset, filterMentions, mentionQuery, placeholderFor, isStoreBusy } from "./logic";
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
  it("arcs to the right of Go", () => {
    for (let i = 0; i < 3; i++) expect(fanOffset(i).x).toBeGreaterThan(0);
    expect(fanOffset(0).y).toBeLessThan(0);
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
