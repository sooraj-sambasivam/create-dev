import { describe, expect, it } from "vitest";
import { applyMention, fanOffset, pickFanDir, filterMentions, mentionQuery, placeholderFor, isStoreBusy, isDeictic, routesToSelection, isQuestion, routeFor, defaultModeFor } from "./logic";

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
  });
  it("keeps even spacing with a clear gap in both directions", () => {
    for (const dir of ["right", "left"] as const) {
      const d = (a: number, b: number) => Math.hypot(fanOffset(a, dir).x - fanOffset(b, dir).x, fanOffset(a, dir).y - fanOffset(b, dir).y);
      expect(Math.abs(d(0, 1) - d(1, 2))).toBeLessThanOrEqual(2);
      expect(Math.min(d(0, 1), d(1, 2))).toBeGreaterThanOrEqual(32 + 20);
    }
  });
  it("flips left only when the right side is cramped", () => {
    expect(pickFanDir(500, 900)).toBe("right");
    expect(pickFanDir(880, 900)).toBe("left");
  });
  it("placeholder", () => {
    expect(placeholderFor(false)).toBe("Describe what to build");
    expect(placeholderFor(false, "chat")).toBe("Ask anything, or point and ask");
    expect(placeholderFor(true, "chat")).toBe("Ask anything, or point and ask");
    expect(placeholderFor(true)).toBe("Describe a change");
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

describe("chat/code routing", () => {
  it("recognises questions by mark or opening word", () => {
    for (const q of ["what does this 4.9 mean?", "How do I add a form", "explain the hero", "is this responsive", "Can you make it blue?", "why"]) expect(isQuestion(q)).toBe(true);
    for (const t of ["make this bigger", "add a pricing section", "Describe a change", "whatever, make it red", "island theme", "do it"]) {
      expect(isQuestion(t)).toBe(t === "do it" ? true : false);
    }
  });
  it("chat always asks; code asks only for questions", () => {
    expect(routeFor("make this bigger", "chat")).toBe("ask");
    expect(routeFor("make this bigger", "code")).toBe("code");
    expect(routeFor("what is this?", "code")).toBe("ask");
  });
  it("starts in chat only for the ask intent", () => {
    expect(defaultModeFor("ask")).toBe("chat");
    expect(defaultModeFor("build")).toBe("code");
    expect(defaultModeFor("both")).toBe("code");
  });
  it("treats an asking store as busy", () => {
    expect(isStoreBusy({ status: "idle", aiBusyId: null, asking: true })).toBe(true);
  });
});
