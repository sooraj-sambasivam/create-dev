import { describe, expect, it } from "vitest";
import { applyMention, fanOffset, fanRise, filterMentions, mentionQuery, placeholderFor, isStoreBusy, isDeictic, routesToSelection, isQuestion, routeFor, defaultModeFor } from "./logic";

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
  it("lines the bubbles up in one row above the composer, right-aligned on Go", () => {
    const rise = fanRise(300, 200); // Go's top is 100px below the composer's top
    expect(rise).toBe(100 + 12 + 32);
    const offsets = [0, 1, 2].map((i) => fanOffset(i, rise));
    expect(offsets[0].x).toBe(0);
    for (const o of offsets) expect(o.y).toBe(-rise);
    expect(offsets[1].x).toBeLessThan(offsets[0].x);
  });
  it("leaves an 8px gap between neighbouring bubbles", () => {
    expect(fanOffset(0, 50).x - fanOffset(1, 50).x - 32).toBe(8);
    expect(fanOffset(1, 50).x - fanOffset(2, 50).x - 32).toBe(8);
  });
  it("clears the composer top by at least 12px", () => {
    const goTop = 300;
    const rise = fanRise(goTop, goTop - 100);
    const bubbleBottom = goTop + 16 - rise + 16;
    expect(goTop - 100 - bubbleBottom).toBeGreaterThanOrEqual(12);
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
