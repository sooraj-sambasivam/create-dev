import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CaptureInputSchema, type CaptureInput } from "@create/shared";
import { classifyIntent, pickAncestors } from "./container";
import { fuse } from "./fuse";
import { locate } from "./locate";
import { locateAx } from "./providers/ax";
import { locateDom } from "./providers/dom";

const SIZE = { w: 1440, h: 900 };
const run = (p: typeof locateDom, input: CaptureInput) => p({ input, image: null, deps: {}, timeoutMs: 50 });
const table = { x: 100, y: 200, w: 800, h: 400 };
const row = { x: 100, y: 300, w: 800, h: 40 };
const cell = { x: 300, y: 305, w: 90, h: 30 };
const dom = (utterance?: string): CaptureInput => ({
  source: "extension",
  imageSize: SIZE,
  cursor: { x: 340, y: 320 },
  utterance,
  dom: {
    tag: "span",
    text: "$1,020",
    rect: cell,
    selectorPath: "table > tr > td > span",
    tableLike: true,
    ancestors: [
      { tag: "td", rect: cell, kind: "section" }, // not a container: ignored for table/row choice
      { tag: "tr", rect: row, kind: "row" },
      { tag: "table", rect: table, kind: "table" },
      { tag: "main", rect: { x: 0, y: 0, w: 1440, h: 900 }, kind: "section" },
    ],
  },
});

describe("intent", () => {
  it.each([
    ["track this", "container"],
    ["turn this into an app", "container"],
    ["make an app from this table", "container"],
    ["track this sales table", "container"],
    ["track this train", "container"],
    ["track this row", "row"],
    ["open this entry", "row"],
    ["this row", "row"],
    ["what time is this train?", "cell"],
    ["how much is this", "cell"],
    ["track this price", "cell"],
    ["what does this column mean?", "cell"],
    ["sign me up", "cell"],
    ["hmm", "unknown"],
  ])("%s -> %s", (u, want) => expect(classifyIntent(u)).toBe(want));
});

describe("container choice: DOM", () => {
  it("track / make an app -> the table first, then row, then cell", async () => {
    for (const u of ["turn this into an app", "make an app from this table"]) {
      const r = await run(locateDom, dom(u));
      expect(r.map((x) => x.scope)).toEqual(["container", "row", "cell"]);
      expect(r[0]).toMatchObject({ box: table, kind: "table", source: "dom" });
      expect(r[0]!.confidence).toBeGreaterThan(r[1]!.confidence);
      expect(r[1]!.confidence).toBeGreaterThan(r[2]!.confidence);
    }
  });
  it("this row / this one -> the row first", async () => {
    const r = await run(locateDom, dom("open this one"));
    expect(r.map((x) => x.scope)).toEqual(["row", "container", "cell"]);
    expect(r[0]!.box).toEqual(row);
  });
  it("a number question -> the cell first", async () => {
    const r = await run(locateDom, dom("how much is this?"));
    expect(r.map((x) => x.scope)).toEqual(["cell", "row", "container"]);
    expect(r[0]!.box).toEqual(cell);
  });
  it("no utterance inside a table prefers the container (the old cell-box failure)", async () => {
    const r = await run(locateDom, dom());
    expect(r[0]).toMatchObject({ scope: "container", box: table });
  });
  it("without ancestors it still returns the single element rect", async () => {
    const i = dom("track this");
    delete i.dom!.ancestors;
    const r = await run(locateDom, i);
    expect(r).toHaveLength(1);
    expect(r[0]!.box).toEqual(cell);
  });
  it("a button with no data container stays the element", async () => {
    const i: CaptureInput = { source: "extension", imageSize: SIZE, cursor: { x: 60, y: 40 }, utterance: "sign me up", dom: { tag: "a", text: "Get started", rect: { x: 10, y: 10, w: 100, h: 60 }, selectorPath: "a", ancestors: [{ tag: "section", rect: { x: 0, y: 0, w: 1440, h: 400 }, kind: "section" }] } };
    const r = await run(locateDom, i);
    expect(r[0]).toMatchObject({ scope: "cell", kind: "button" });
  });
  it("charts widen to the outermost chart ancestor", () => {
    const a = (tag: string, w: number) => ({ tag, rect: { x: 0, y: 0, w, h: w }, kind: "chart" as const });
    expect(pickAncestors([a("svg", 10), a("figure", 20), { tag: "div", rect: { x: 0, y: 0, w: 1, h: 1 }, kind: "section" }]).container?.tag).toBe("figure");
  });
  it("accepts ancestors in the contract and caps them at 6", () => {
    expect(CaptureInputSchema.safeParse(dom("x")).success).toBe(true);
    const many = { ...dom("x"), dom: { ...dom("x").dom!, ancestors: Array(7).fill({ tag: "div", rect: table, kind: "list" }) } };
    expect(CaptureInputSchema.safeParse(many).success).toBe(false);
  });
});

describe("container choice: AX + fusion", () => {
  const ax: CaptureInput = {
    source: "extension",
    imageSize: SIZE,
    cursor: { x: 340, y: 320 },
    ax: {
      role: "AXWebArea",
      frame: { x: 0, y: 0, w: 1440, h: 900 },
      children: [
        { role: "cell", title: "$1,020", frame: cell },
        { role: "row", frame: { ...row, w: 21000 } },
        { role: "table", title: "Sales", frame: { ...table, w: 21000 } },
        { role: "main", frame: { x: 24, y: 63, w: 1392, h: 2099 } },
      ],
    },
  };
  it("orders cell / row / table by intent and clips to the capture", async () => {
    const c = await run(locateAx, { ...ax, utterance: "track this" });
    expect(c.map((x) => x.scope)).toEqual(["container", "row", "cell"]);
    expect(c[0]!.box.w).toBe(SIZE.w - table.x);
    const r = await run(locateAx, { ...ax, utterance: "open this row" });
    expect(r[0]!.scope).toBe("row");
    const v = await run(locateAx, { ...ax, utterance: "what is this number" });
    expect(v[0]!.scope).toBe("cell");
  });
  it("fills the row/container from node ancestors when the tree lacks them", async () => {
    const flat: CaptureInput = { ...ax, utterance: "this row", ax: { role: "AXWebArea", frame: { x: 0, y: 0, w: 1440, h: 900 }, ancestors: [{ tag: "tr", rect: row, kind: "row" }, { tag: "table", rect: table, kind: "table" }], children: [{ role: "cell", frame: cell }] } };
    const r = await run(locateAx, flat);
    expect(r[0]).toMatchObject({ scope: "row", box: row });
    expect(r.some((x) => x.scope === "container" && x.kind === "table")).toBe(true);
  });
  it("fusion: the container wins for 'track this', the row for 'this row', the cell for a value, with AX and DOM together", async () => {
    const both = (u: string): CaptureInput => ({ ...ax, ...dom(u), ax: ax.ax, utterance: u });
    for (const [u, want] of [["turn this into an app", table], ["open this row", row], ["what is this number?", cell]] as const) {
      const input = both(u);
      const all = [...(await run(locateAx, input)), ...(await run(locateDom, input))];
      const out = fuse(all, input.cursor, SIZE);
      expect(out.result?.box.x).toBe(want.x);
      expect(out.result?.box.h).toBe(want.h);
      expect(out.ask).toBeUndefined();
    }
  });
  it("locate() end to end returns the table for 'track this' without pixel providers", async () => {
    const res = await locate({ ...dom("track this") }, undefined, { writeTrace: false });
    expect(res.result?.box).toEqual(table);
  });
});

describe("corpus dom.json / ax.json with ancestors", () => {
  const dir = path.resolve(__dirname, "../../../../eval/pointer/corpus");
  const load = (id: string, f: string) => JSON.parse(readFileSync(path.join(dir, id, f), "utf8"));
  const ids = [
    ["t12-wiki-companies-row", "open this company", "row"],
    ["t14-wiki-seattle-temp-row", "track this table", "container"],
    ["t07-gsheet-sales-total", "track this number", "cell"],
  ] as const;
  it.each(ids)("%s (%s) picks the %s box", async (id, utterance, scope) => {
    const t = load(id, "target.json");
    const input: CaptureInput = { source: "app", cursor: t.cursor, imageSize: t.imageSize, utterance, dom: load(id, "dom.json"), ax: load(id, "ax.json") };
    expect(CaptureInputSchema.safeParse(input).success).toBe(true);
    const d = await run(locateDom, input);
    expect(d[0]!.scope).toBe(scope);
    const a = await run(locateAx, input);
    expect(a[0]!.scope).toBe(scope);
  });
});
