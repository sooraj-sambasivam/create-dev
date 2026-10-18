import { describe, expect, it } from "vitest";
import { postJson } from "./post";
import express from "express";
import { EntitySchema, ScreenSchema, walkNodes, type Entity } from "@create/shared";
import { entityToScreen, parseNumber } from "./entityToScreen";
import { createLiftRouter } from "./route";
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
    expect(nodes["data-chart"].series.map((x: any) => x.values)).toEqual([[10, 25], [1200.5, 2]]);
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
