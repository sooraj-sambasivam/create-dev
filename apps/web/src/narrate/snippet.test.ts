import { describe, expect, it } from "vitest";
import { boundsOf, elementsInLoop, kindOf, loopCoverage, lowestCommonContainer, pickStyles, pointInPolygon, sanitizeElementHtml, safeAttr, titleOf, type SnipEl, type SnipNode } from "./snippet";
import { consumeLassoClick, markLassoDrag, peekLassoClick, resetLassoGesture } from "../modes/narrate/overlay/lassoGesture";

type Spec = { tag: string; box?: [number, number, number, number]; attrs?: Record<string, string>; kids?: Array<Spec | string> };
function make(spec: Spec, parent: SnipEl | null = null): SnipEl {
  const [l, t, w, h] = spec.box ?? [0, 0, 0, 0];
  const nodes: SnipNode[] = [];
  const children: SnipEl[] = [];
  const el: SnipEl = {
    nodeType: 1,
    nodeValue: null,
    tagName: spec.tag.toUpperCase(),
    attributes: Object.entries(spec.attrs ?? {}).map(([name, value]) => ({ name, value })),
    childNodes: nodes,
    children,
    parentElement: parent,
    getBoundingClientRect: () => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h }),
  };
  for (const k of spec.kids ?? []) {
    if (typeof k === "string") nodes.push({ nodeType: 3, nodeValue: k });
    else { const c = make(k, el); nodes.push(c); children.push(c); }
  }
  return el;
}
const square = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
// A loose circle-ish loop around (200,150) with radius 140.
const loop = Array.from({ length: 24 }, (_, i) => ({ x: 200 + 140 * Math.cos((i / 24) * Math.PI * 2), y: 150 + 140 * Math.sin((i / 24) * Math.PI * 2) }));
const V = { vw: 1000, vh: 800 };

describe("loop geometry", () => {
  it("point in polygon, including a concave loop", () => {
    expect(pointInPolygon(5, 5, square(0, 0, 10, 10))).toBe(true);
    expect(pointInPolygon(15, 5, square(0, 0, 10, 10))).toBe(false);
    const u = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 7, y: 10 }, { x: 7, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon(5, 8, u)).toBe(false);
    expect(pointInPolygon(1, 8, u)).toBe(true);
  });
  it("coverage is the share of the box inside the loop, clipped to the viewport", () => {
    const poly = square(0, 0, 100, 100);
    const box = (l: number, t: number, w: number, h: number) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h });
    expect(loopCoverage(box(10, 10, 50, 50), poly, 1000, 800)).toBe(1);
    expect(loopCoverage(box(50, 0, 100, 100), poly, 1000, 800)).toBeCloseTo(0.4, 1);
    expect(loopCoverage(box(300, 300, 50, 50), poly, 1000, 800)).toBe(0);
    expect(loopCoverage(box(-500, -500, 50, 50), poly, 1000, 800)).toBe(0);
  });
  it("boundsOf an empty loop is zero", () => {
    expect(boundsOf([]).area).toBe(0);
  });
});

describe("elementsInLoop and the lowest common container", () => {
  const page = make({
    tag: "body",
    box: [0, 0, 1000, 800],
    kids: [
      { tag: "header", box: [0, 0, 1000, 60], kids: ["Site"] },
      {
        tag: "section",
        box: [100, 80, 200, 150],
        attrs: { class: "card" },
        kids: [{ tag: "h3", box: [110, 90, 180, 24], kids: ["Pro plan"] }, { tag: "p", box: [110, 130, 180, 24], kids: ["$9 / month"] }],
      },
      { tag: "section", box: [600, 500, 300, 200], kids: [{ tag: "p", box: [610, 510, 280, 24], kids: ["Elsewhere"] }] },
    ],
  });
  it("collects elements mostly inside the loop and ignores wrappers larger than the loop", () => {
    const hit = elementsInLoop(page, loop, V);
    const tags = hit.map((e) => e.tagName);
    expect(tags).toContain("H3");
    expect(tags).toContain("P");
    expect(hit.some((e) => e.tagName === "BODY" || e.tagName === "HEADER")).toBe(false);
    expect(hit.some((e) => e.getBoundingClientRect().left >= 600)).toBe(false);
  });
  it("picks the lowest container holding every enclosed element", () => {
    const hit = elementsInLoop(page, loop, V);
    const c = lowestCommonContainer(hit);
    expect(c?.tagName).toBe("SECTION");
    expect(c?.attributes[0]?.value).toBe("card");
  });
  it("a loop around one leaf gives that leaf; an empty loop gives nothing", () => {
    const one = elementsInLoop(page, square(100, 85, 300, 120), V);
    expect(lowestCommonContainer(one)?.tagName).toBe("H3");
    expect(lowestCommonContainer(elementsInLoop(page, square(700, 10, 900, 40), V))).toBeNull();
    expect(elementsInLoop(page, [{ x: 1, y: 1 }, { x: 2, y: 2 }], V)).toEqual([]);
  });
  it("skips marked subtrees (the narrate overlay)", () => {
    const hit = elementsInLoop(page, loop, { ...V, skip: (e) => e.tagName === "H3" });
    expect(hit.some((e) => e.tagName === "H3")).toBe(false);
  });
  it("common container of siblings is their parent", () => {
    const sec = page.children[1]!;
    expect(lowestCommonContainer([sec.children[0]!, sec.children[1]!])).toBe(sec);
  });
});

describe("payload sanitization", () => {
  it("keeps allow-listed tags and attributes and drops handlers, scripts, styles and javascript urls", () => {
    const el = make({
      tag: "div",
      attrs: { class: "box", onclick: "steal()", style: "color:red", "data-secret": "x" },
      kids: [
        { tag: "script", kids: ["alert(1)"] },
        { tag: "style", kids: ["p{}"] },
        { tag: "a", attrs: { href: "javascript:alert(1)" }, kids: ["bad"] },
        { tag: "a", attrs: { href: "https://ok.test/x" }, kids: ["good"] },
        { tag: "img", attrs: { src: "https://i.test/a.png", alt: "pic", onerror: "x()" } },
        { tag: "img", attrs: { src: "javascript:1" } },
        { tag: "iframe", attrs: { src: "https://evil.test" } },
        { tag: "my-widget", kids: ["inner text"] },
        "a < b & c",
      ],
    });
    const html = sanitizeElementHtml(el);
    expect(html).not.toMatch(/onclick|onerror|script|style=|data-secret|iframe|javascript|alert/i);
    expect(html).toContain('class="box"');
    expect(html).toContain('href="https://ok.test/x" rel="noopener noreferrer"');
    expect(html).toContain('<img src="https://i.test/a.png" alt="pic">');
    expect(html).toContain("inner text");
    expect(html).toContain("a &lt; b &amp; c");
    expect((html.match(/<img/g) ?? []).length).toBe(1);
  });
  it("is capped at 20 KB and stays balanced", () => {
    const rows: Spec[] = Array.from({ length: 2000 }, (_, i) => ({ tag: "p", attrs: { class: "row" }, kids: [`row number ${i} with some text`] }));
    const html = sanitizeElementHtml(make({ tag: "div", kids: rows }));
    expect(html.length).toBeLessThanOrEqual(20_480);
    expect(html.length).toBeGreaterThan(5000);
    expect(html.startsWith("<div>")).toBe(true);
    expect(html.endsWith("</div>")).toBe(true);
    expect((html.match(/<p /g) ?? []).length).toBe((html.match(/<\/p>/g) ?? []).length);
  });
  it("attribute filter", () => {
    expect(safeAttr("href", " JaVa\tScript:1")).toBeNull();
    expect(safeAttr("src", "data:image/svg+xml;base64,AAAA")).toBeNull();
    expect(safeAttr("src", "data:image/png;base64,AAAA")).not.toBeNull();
    expect(safeAttr("onload", "x")).toBeNull();
    expect(safeAttr("class", "a b")).toBe("a b");
  });
  it("styles subset keeps only useful, non-default values", () => {
    const s = pickStyles({ display: "flex", color: "rgb(0, 0, 0)", backgroundColor: "rgba(0, 0, 0, 0)", borderRadius: "12px", margin: "0px", fontFamily: "Inter", zIndex: "9", transform: "x" });
    expect(s).toEqual({ display: "flex", color: "rgb(0, 0, 0)", "border-radius": "12px", "font-family": "Inter" });
  });
  it("titles and kinds", () => {
    expect(titleOf(make({ tag: "div", kids: [{ tag: "h3", kids: ["Pro plan"] }, "x"] }))).toBe("Pro plan");
    expect(titleOf(make({ tag: "div" }), "Fallback")).toBe("Fallback");
    expect(kindOf(make({ tag: "table" }))).toBe("table");
    expect(kindOf(make({ tag: "div" }))).toBe("snippet");
  });
});

describe("a drag is not a click", () => {
  it("swallows exactly one click shortly after a lasso drag", () => {
    resetLassoGesture();
    expect(consumeLassoClick()).toBe(false);
    markLassoDrag(1000);
    expect(peekLassoClick(1100)).toBe(true);
    expect(consumeLassoClick(1100)).toBe(true);
    expect(consumeLassoClick(1100)).toBe(false);
    markLassoDrag(1000);
    expect(consumeLassoClick(2000)).toBe(false);
  });
});
