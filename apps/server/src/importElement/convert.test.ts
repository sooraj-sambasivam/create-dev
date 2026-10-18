import { describe, expect, it } from "vitest";
import { findNode } from "@create/shared";
import { domToScreen, toHex, measure, type SnapshotNode } from "./convert";

const root: SnapshotNode = {
  tag: "section",
  style: { display: "flex", flexDirection: "column", backgroundColor: "rgb(17, 24, 39)" },
  children: [
    { tag: "h1", text: "Pricing", style: { fontSize: "48px", fontWeight: "700", color: "rgb(255, 255, 255)" } },
    { tag: "p", text: "Simple  plans\n for everyone" },
    { tag: "img", src: "https://example.com/a.png", alt: "Plan" },
    { tag: "img", src: "http://insecure.test/a.png", alt: "Fallback" },
    { tag: "ul", children: [{ tag: "li", text: "One" }, { tag: "li", text: "Two" }] },
    { tag: "div", style: { display: "flex", flexDirection: "row" }, children: [
      { tag: "a", text: "Buy", href: "https://example.com/buy", style: { backgroundColor: "rgb(37, 99, 235)" } },
      { tag: "a", text: "Docs", href: "javascript:alert(1)" },
    ] },
    { tag: "script", text: "evil()" },
  ],
};

describe("domToScreen", () => {
  const s = domToScreen({ title: "Acme", url: "https://example.com", root });
  const flat = JSON.stringify(s);

  it("produces a valid dark screen with the page title and accent", () => {
    expect(s.title).toBe("Acme");
    expect(s.theme).toBe("dark");
    expect(s.accent).toBe("#2563eb");
  });
  it("maps headings, text, lists and images", () => {
    const c = s.children[0]!;
    expect(c.type).toBe("container");
    const kids = (c as any).children;
    expect(kids[0]).toMatchObject({ type: "heading", text: "Pricing", level: 1 });
    expect(kids[0].style).toMatchObject({ fontSize: "4xl", weight: "bold", color: "#ffffff" });
    expect(kids[1]).toMatchObject({ type: "text", text: "Simple plans for everyone" });
    expect(kids[2]).toMatchObject({ type: "image", src: "https://example.com/a.png" });
    expect(kids[3]).toMatchObject({ type: "image", src: null, query: "Fallback" });
    expect(kids[4]).toMatchObject({ type: "list", items: ["One", "Two"] });
  });
  it("uses row containers and drops unsafe hrefs and scripts", () => {
    const row = (s.children[0] as any).children[5];
    expect(row.direction).toBe("row");
    expect(row.children[0]).toMatchObject({ type: "button", label: "Buy", href: "https://example.com/buy" });
    expect(row.children[1]).toMatchObject({ type: "link", text: "Docs", href: null });
    expect(flat).not.toContain("evil");
  });
  it("has unique ids", () => {
    const ids = [...flat.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findNode(s, ids[0]!)).toBeTruthy();
  });
  it("falls back on empty input", () => {
    expect(domToScreen({ root: { tag: "div" } }).children[0]).toMatchObject({ type: "text" });
  });
});

describe("helpers", () => {
  it("toHex", () => {
    expect(toHex("rgb(255, 0, 0)")).toBe("#ff0000");
    expect(toHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(toHex("#abc")).toBe("#aabbcc");
  });
  it("measure", () => {
    expect(measure(root).depth).toBe(2);
  });
});
