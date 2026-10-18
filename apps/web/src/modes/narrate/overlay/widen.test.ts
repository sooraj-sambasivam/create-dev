import { describe, expect, it } from "vitest";
import {
  buildWidenChain,
  cellAt,
  confidence,
  dwellLevel,
  dwellProgress,
  meterSteps,
  sizeLabel,
  stepDwell,
  tableNote,
  tableShape,
  WIDEN_STEP_MS,
  type WidenEl,
} from "./widen";

type Spec = { tag: string; attrs?: Record<string, string>; text?: string; parent?: WidenEl | null; sel?: Record<string, WidenEl[]>; closest?: Record<string, WidenEl> };

function el(s: Spec): WidenEl {
  const e: WidenEl = {
    tagName: s.tag.toUpperCase(),
    textContent: s.text ?? "",
    parentElement: s.parent ?? null,
    getAttribute: (n) => s.attrs?.[n] ?? null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
    closest: (sel) => s.closest?.[sel] ?? null,
    querySelectorAll: (sel) => s.sel?.[sel] ?? [],
  };
  return e;
}

function table() {
  const th = el({ tag: "th", text: "Stop" });
  const headRow = el({ tag: "tr", sel: { "th,td": [th, th, th, th] } });
  const bodyRows = Array.from({ length: 12 }, () => el({ tag: "tr", sel: { "th,td": [th, th, th, th] } }));
  const wrapper = el({
    tag: "div",
    attrs: { "data-node-id": "t1", "data-node-type": "table" },
    sel: { tr: [headRow, ...bodyRows], "thead tr": [headRow] },
  });
  return { wrapper, headRow, bodyRows };
}

describe("tableShape", () => {
  it("counts body rows and columns", () => {
    const { wrapper } = table();
    expect(tableShape(wrapper)).toEqual({ rows: 12, cols: 4 });
    expect(tableNote({ rows: 12, cols: 4 })).toBe("12 rows, 4 columns");
    expect(tableNote({ rows: 1, cols: 1 })).toBe("1 row, 1 column");
  });
});

describe("buildWidenChain", () => {
  it("goes cell, row, table inside a table", () => {
    const { wrapper, bodyRows } = table();
    const cell = el({ tag: "td", text: "7:42 AM" });
    const under = el({
      tag: "span",
      closest: { "td,th": cell, tr: bodyRows[2], table: wrapper },
    });
    const chain = buildWidenChain(under, { id: "t1", el: wrapper }, "Table");
    expect(chain.map((l) => l.kind)).toEqual(["cell", "row", "table"]);
    expect(chain[0].label).toBe("Cell · 7:42 AM");
    expect(chain[1].label).toBe("Row 3 of 12");
    expect(chain[2].label).toBe("Table · 12 rows × 4 cols");
    expect(chain.every((l) => l.nodeId === "t1")).toBe(true);
  });

  it("names the header row", () => {
    const { wrapper, headRow } = table();
    const under = el({ tag: "th", closest: { "td,th": el({ tag: "th", text: "Stop" }), tr: headRow, table: wrapper } });
    const chain = buildWidenChain(under, { id: "t1", el: wrapper }, "Table");
    expect(chain[1].label).toBe("Header row");
  });

  it("adds containers around the hit as sections, at most two", () => {
    const outer = el({ tag: "div", attrs: { "data-node-id": "c3", "data-node-type": "container" } });
    const mid2 = el({ tag: "div", attrs: { "data-node-id": "c2", "data-node-type": "container" }, parent: outer });
    const mid1 = el({ tag: "div", attrs: { "data-node-id": "c1", "data-node-type": "container" }, parent: mid2 });
    const h = el({ tag: "h2", attrs: { "data-node-id": "h1", "data-node-type": "heading" }, parent: mid1 });
    const chain = buildWidenChain(h, { id: "h1", el: h }, "Heading · Welcome");
    expect(chain.map((l) => [l.kind, l.nodeId])).toEqual([["node", "h1"], ["section", "c1"], ["section", "c2"]]);
  });

  it("stops at the page root", () => {
    const c1 = el({ tag: "div", attrs: { "data-node-id": "c1", "data-node-type": "container" } });
    const h = el({ tag: "h2", attrs: { "data-node-id": "h1", "data-node-type": "heading" }, parent: c1 });
    const chain = buildWidenChain(h, { id: "h1", el: h }, "Heading", { contains: () => false });
    expect(chain).toHaveLength(1);
  });

  it("is empty with no hit", () => {
    expect(buildWidenChain(null, null, "")).toEqual([]);
  });
});

describe("dwell", () => {
  it("keeps the start time while the pointer stays put", () => {
    const a = stepDwell(null, { t: 100, x: 10, y: 10, key: "t1" });
    const b = stepDwell(a, { t: 300, x: 14, y: 12, key: "t1" });
    expect(b).toBe(a);
  });

  it("restarts on drift or a new target", () => {
    const a = stepDwell(null, { t: 100, x: 10, y: 10, key: "t1" });
    expect(stepDwell(a, { t: 300, x: 60, y: 10, key: "t1" }).since).toBe(300);
    expect(stepDwell(a, { t: 300, x: 10, y: 10, key: "t2" }).since).toBe(300);
  });

  it("widens one level per step and caps at the last", () => {
    const s = stepDwell(null, { t: 0, x: 0, y: 0, key: "k" });
    expect(dwellLevel(s, 0, 3)).toBe(0);
    expect(dwellLevel(s, WIDEN_STEP_MS - 1, 3)).toBe(0);
    expect(dwellLevel(s, WIDEN_STEP_MS, 3)).toBe(1);
    expect(dwellLevel(s, WIDEN_STEP_MS * 2, 3)).toBe(2);
    expect(dwellLevel(s, WIDEN_STEP_MS * 9, 3)).toBe(2);
    expect(dwellLevel(s, 5000, 1)).toBe(0);
    expect(dwellLevel(null, 5000, 3)).toBe(0);
    expect(dwellLevel(s, 5000, 0)).toBe(0);
  });

  it("reports progress toward the next step", () => {
    const s = stepDwell(null, { t: 0, x: 0, y: 0, key: "k" });
    expect(dwellProgress(s, WIDEN_STEP_MS / 2, 3)).toBeCloseTo(0.5);
    expect(dwellProgress(s, WIDEN_STEP_MS * 5, 3)).toBe(1);
    expect(dwellProgress(s, 100, 1)).toBe(0);
  });
});

describe("confidence and ticks", () => {
  it("grows from cell to table", () => {
    expect(confidence("cell", false)).toBeLessThan(confidence("row", false));
    expect(confidence("row", false)).toBeLessThan(confidence("table", false));
    expect(confidence("table", true)).toBeLessThanOrEqual(1);
  });
  it("fills 1..5 meter steps", () => {
    expect(meterSteps(0.05)).toBe(1);
    expect(meterSteps(0.58)).toBe(3);
    expect(meterSteps(0.93)).toBe(5);
    expect(meterSteps(2)).toBe(5);
  });
  it("formats a size", () => {
    expect(sizeLabel({ width: 611.6, height: 240.2 })).toBe("612 × 240");
  });
});

describe("cellAt", () => {
  const cellAtX = (left: number, text: string): WidenEl => ({
    ...el({ tag: "td", text }),
    getBoundingClientRect: () => ({ left, top: 0, width: 100, height: 40 }),
  });
  const rowAt = (top: number, cells: WidenEl[]): WidenEl => ({
    ...el({ tag: "tr", sel: { "th,td": cells } }),
    getBoundingClientRect: () => ({ left: 0, top, width: 300, height: 40 }),
  });
  const rows = Array.from({ length: 20 }, (_, i) => rowAt(i * 40, [cellAtX(0, `a${i}`), cellAtX(100, `b${i}`), cellAtX(200, `c${i}`)]));
  const tbl = el({ tag: "div", sel: { tr: rows } });

  it("finds the row and cell under a point, by geometry", () => {
    const hit = cellAt(tbl, 150, 5 * 40 + 10)!;
    expect(hit.cell.textContent).toBe("b5");
    expect(hit.row).toBe(rows[5]);
    expect(cellAt(tbl, 250, 0 + 1)!.cell.textContent).toBe("c0");
    expect(cellAt(tbl, 20, 19 * 40 + 39)!.cell.textContent).toBe("a19");
  });
  it("is null outside the table", () => {
    expect(cellAt(tbl, 150, 5000)).toBeNull();
    expect(cellAt(tbl, 150, -5)).toBeNull();
    expect(cellAt(tbl, 900, 10)).toBeNull();
  });
  it("lets the chain start at the cell with no hit-tested element", () => {
    const wrapper = { ...tbl, getAttribute: (n: string) => (n === "data-node-id" ? "t1" : null) };
    const chain = buildWidenChain(null, { id: "t1", el: wrapper }, "Table", null, () => "table", { x: 150, y: 90 });
    expect(chain.map((l) => l.kind)).toEqual(["cell", "row", "table"]);
    expect(chain[0].label).toBe("Cell · b2");
  });
});
