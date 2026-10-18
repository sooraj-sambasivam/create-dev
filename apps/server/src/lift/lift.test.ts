import { describe, expect, it } from "vitest";
import { postJson } from "./post";
import express from "express";
import { EntitySchema, ScreenSchema, walkNodes, type Entity } from "@create/shared";
import { entityToScreen, parseNumber } from "./entityToScreen";
import { createLiftRouter } from "./route";
import { cleanEntity, planChart } from "./clean";
import type { PrototypeStore } from "../store/prototypes";

const entity: Entity = EntitySchema.parse({
  kind: "table",
  title: "Bus loads",
  columns: [
    { key: "wk", label: "Week", type: "text" },
    { key: "n", label: "Riders", type: "number" },
    { key: "fare", label: "Fare", type: "money" },
  ],
  rows: [{ wk: "W1", n: "10", fare: "$1,200.50" }, { wk: "W2", n: "25", fare: "$2.00" }],
  source: { title: "King County Metro" },
});

describe("entityToScreen", () => {
  it("builds header, live table, chart and form wired to formId", () => {
    const s = entityToScreen(entity, "f1");
    expect(ScreenSchema.safeParse(s).success).toBe(true);
    const nodes: Record<string, any> = {};
    const types: string[] = [];
    walkNodes(s.children, (n) => { nodes[n.id] = n; types.push(n.type); });
    expect(nodes["source"].text).toBe("From King County Metro");
    expect(nodes["data-table"].columns).toEqual(["Week", "Riders", "Fare"]);
    expect(nodes["data-table"].rows[0]).toEqual(["W1", "10", "$1,200.50"]);
    expect(nodes["data-table"].liveFormId).toBe("f1");
    expect(nodes["data-chart"].kind).toBe("bar");
    expect(nodes["data-chart"].labels).toEqual(["W1", "W2"]);
    expect(nodes["data-chart"].series.map((x: any) => x.values)).toEqual([[1200.5, 2]]);
    expect(nodes["data-chart"].liveFormId).toBe("f1");
    expect(nodes["f1"].type).toBe("container");
    expect(types.filter((t) => t === "textbox")).toHaveLength(3);
    expect(nodes["form-submit"].type).toBe("button");
  });
  it("uses a line chart for date labels and omits the chart without numbers", () => {
    const d = entityToScreen({ ...entity, columns: [{ key: "wk", label: "Day", type: "date" }, entity.columns[1]!] }, "f");
    const t: Record<string, any> = {};
    walkNodes(d.children, (n) => { t[n.id] = n; });
    expect(t["data-chart"].kind).toBe("line");
    const none = entityToScreen({ ...entity, columns: [entity.columns[0]!] }, "f");
    walkNodes(none.children, (n) => { t[n.id] = n; });
    let hasChart = false;
    walkNodes(none.children, (n) => { if (n.type === "chart") hasChart = true; });
    expect(hasChart).toBe(false);
  });
  it("only changes copy, never rows", () => {
    const s = entityToScreen(entity, "f", { title: "Rides", summary: "Track rides.", footer: "Hi" });
    expect(s.title).toBe("Rides");
    let rows: unknown;
    walkNodes(s.children, (n) => { if (n.type === "table") rows = n.rows; });
    expect(rows).toEqual([["W1", "10", "$1,200.50"], ["W2", "25", "$2.00"]]);
  });
  it("parses numbers", () => {
    expect(parseNumber("12%")).toBe(12);
    expect(parseNumber("(3)")).toBe(-3);
    expect(parseNumber("n/a")).toBe(0);
  });
});

describe("POST /api/lift", () => {
  const saved: unknown[] = [];
  const store: PrototypeStore = {
    async save(p) { saved.push(p); return { id: "abcdefghij", title: p.title, screen: p.screen, createdAt: "now" } as never; },
    async get() { return null; },
  };
  const app = express().use("/api", createLiftRouter(store));
  it("saves and returns link + formId", async () => {
    process.env.MOCK_AI = "1";
    const r = await postJson(app, "/api/lift", { entity });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: "abcdefghij", formId: "add-row", provider: "mock" });
    expect(r.body.url).toContain("?p=abcdefghij");
    expect(saved).toHaveLength(1);
  });
  it("rejects bad bodies", async () => {
    const r = await postJson(app, "/api/lift", { entity: { kind: "x" } });
    expect(r.status).toBe(400);
  });
});

describe("lift tray and dedupe", () => {
  it("dedupes identical rows and pushes the result to the tray", async () => {
    const { dedupeRows } = await import("./route");
    const { createTrayStore } = await import("../tray/store");
    expect(dedupeRows([{ a: "1" }, { a: " 1 " }, { a: "2" }])).toEqual([{ a: "1" }, { a: "2" }]);
    const saved: any[] = [];
    const store = { save: async (x: any) => { saved.push(x); return { id: "p1" }; } } as unknown as PrototypeStore;
    const tray = createTrayStore();
    process.env.MOCK_AI = "1";
    const app = express().use("/api", createLiftRouter(store, tray));
    const r = await postJson(app, "/api/lift", { entity: { ...entity, rows: [...entity.rows, entity.rows[0]!, ...Array.from({ length: 3 }, () => entity.rows[1]!)] } });
    delete process.env.MOCK_AI;
    expect(r.status).toBe(200);
    expect(tray.list()).toHaveLength(1);
    expect(tray.list()[0]).toMatchObject({ kind: "table", url: r.body.url });
    const t = JSON.stringify(saved[0].screen);
    expect(t.split('"W1"').length).toBeLessThan(5);
  });
});

describe("cleanEntity and planChart", () => {
  const sales: Entity = EntitySchema.parse({
    kind: "table", title: "track this", source: {},
    columns: [{ key: "a", label: "Category (row 1)", type: "text" }, { key: "b", label: "Sales", type: "text" }, { key: "c", label: "% of Total", type: "text" }],
    rows: [{ a: "A", b: "$100", c: "9.8%" }, { a: "B", b: "$140", c: "13.7%" }, { a: "Total", b: "$240", c: "100.0%" }],
  });
  it("strips position labels and types columns from values", () => {
    const c = cleanEntity(sales);
    expect(c.columns.map((x) => [x.label, x.type])).toEqual([["Category", "text"], ["Sales", "money"], ["% of Total", "percent"]]);
    expect(c.rows).toEqual(sales.rows);
  });
  it("charts one series and leaves out the total row", () => {
    const p = planChart(cleanEntity(sales)) as any;
    expect(p.series.map((s: any) => s.name)).toEqual(["Sales"]);
    expect(p.rowIdx).toEqual([0, 1]);
  });
  it("never titles the app with the user request", () => {
    const s = entityToScreen(sales, "f", {}, "track this");
    expect(s.title).toBe("Sales by category");
  });
  it("plots a price row across plan columns when no column is numeric", () => {
    const e: Entity = EntitySchema.parse({
      kind: "table", title: "Plans", source: {},
      columns: [{ key: "f", label: "Feature", type: "text" }, { key: "s", label: "Starter", type: "text" }, { key: "p", label: "Pro", type: "text" }],
      rows: [{ f: "Price per seat", s: "$0", p: "$12 / month" }, { f: "Support", s: "Community", p: "Email" }],
    });
    const p = planChart(cleanEntity(e)) as any;
    expect(p.transposed).toBe(true);
    expect(p.labels).toEqual(["Starter", "Pro"]);
  });
  it("promotes a header row the extractor read as data", () => {
    const e: Entity = EntitySchema.parse({
      kind: "table", title: "Sheet", source: {},
      columns: ["a", "b", "c", "d"].map((k) => ({ key: k, label: "", type: "text" })),
      rows: [
        { a: "", b: "", c: "Sheet", d: "" }, { a: "Date Created:", b: "June 20, 2023", c: "", d: "" },
        { a: "Category", b: "Sales", c: "% of Total", d: "" }, { a: "A", b: "$100", c: "9.8%", d: "" }, { a: "B", b: "$140", c: "13.7%", d: "" },
      ],
    });
    const c = cleanEntity(e);
    expect(c.columns.map((x) => [x.label, x.type])).toEqual([["Category", "text"], ["Sales", "money"], ["% of Total", "percent"]]);
    expect(c.rows).toHaveLength(2);
  });
  it("downgrades a declared money column that holds words", () => {
    const e: Entity = EntitySchema.parse({
      kind: "table", title: "Plans", source: {},
      columns: [{ key: "f", label: "Feature", type: "text" }, { key: "p", label: "Pro", type: "money" }],
      rows: [{ f: "Price", p: "$12 / month" }, { f: "Projects", p: "Unlimited" }],
    });
    expect(cleanEntity(e).columns[1]!.type).toBe("text");
  });
});
