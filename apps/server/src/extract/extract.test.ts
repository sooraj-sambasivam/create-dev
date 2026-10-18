import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "../lift/post";
import express from "express";
import { EntitySchema } from "@create/shared";
import { extractEntity, mockEntity, parseEntity } from "./extract";
import { extractRouter } from "./route";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.TRACE_DIR = mkdtempSync(path.join(tmpdir(), "extract-trace-"));

afterEach(() => {
  delete process.env.MOCK_AI;
  delete process.env.PERCEPTRON_API_KEY;
  vi.restoreAllMocks();
});

describe("extract", () => {
  it("mock entities validate and depend on the hint", () => {
    for (const h of [undefined, "bus schedule", "pricing plans"]) expect(EntitySchema.safeParse(mockEntity(h)).success).toBe(true);
    expect(mockEntity("bus schedule").kind).toBe("schedule");
  });
  it("parseEntity stringifies cells and rejects junk", () => {
    const e = parseEntity('sure: {"kind":"chart","title":"T","columns":[{"key":"a","label":"A","type":"text"},{"key":"b","label":"B","type":"number"}],"rows":[{"a":"x","b":5}]}');
    expect(e?.rows[0]).toEqual({ a: "x", b: "5" });
    expect(parseEntity("no json")).toBeNull();
    expect(parseEntity('{"kind":"nope"}')).toBeNull();
  });
  it("uses perceptron when configured, falls back to mock on failure", async () => {
    process.env.PERCEPTRON_API_KEY = "k";
    const good = JSON.stringify({ kind: "table", title: "T", columns: [{ key: "a", label: "A", type: "text" }], rows: [{ a: "1" }] });
    const ok = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: good } }] })));
    expect((await extractEntity("data:image/png;base64,AAAA", "x", { fetchImpl: ok as never })).provider).toBe("perceptron");
    const bad = vi.fn(async () => new Response("no", { status: 500 }));
    expect((await extractEntity("data:image/png;base64,AAAA", "x", { fetchImpl: bad as never })).provider).toBe("mock");
  });
  it("POST /api/extract validates and answers", async () => {
    process.env.MOCK_AI = "1";
    const app = express().use("/api", extractRouter);
    expect((await postJson(app, "/api/extract", {})).status).toBe(400);
    const r = await postJson(app, "/api/extract", { image: "data:image/png;base64,AAAA", hint: "chart" });
    expect(r.status).toBe(200);
    expect(r.body.provider).toBe("mock");
  });
  it("perceptron OCR sends a strict json_schema and accepts array rows; box and trace pass through", async () => {
    process.env.PERCEPTRON_API_KEY = "k";
    const content = JSON.stringify({ kind: "table", title: "Fares", columns: [{ key: "route", label: "Route", type: "text" }, { key: "fare", label: "Fare", type: "money" }], rows: [["44", "$2.75"], ["49", "$2.75"]] });
    const f = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] })));
    const stages: unknown[] = [];
    const r = await extractEntity("data:image/png;base64,AAAA", "fares", { fetchImpl: f as never, box: { x: 1, y: 2, w: 3, h: 4 }, onStage: (t) => stages.push(t) });
    expect(r.provider).toBe("perceptron");
    expect(r.entity.rows[1]).toEqual({ route: "49", fare: "$2.75" });
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent.response_format.type).toBe("json_schema");
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(stages).toMatchObject([{ stage: "read", provider: "perceptron", ok: true }]);
  });
  it("POST /api/extract returns a read-stage trace and rejects a bad box", async () => {
    process.env.MOCK_AI = "1";
    const app = express().use("/api", extractRouter);
    const r = await postJson(app, "/api/extract", { image: "data:image/png;base64,AAAA", box: { x: 0, y: 0, w: 10, h: 10 } });
    expect(r.status).toBe(200);
    expect(r.body.trace.stages[0].stage).toBe("read");
    expect(JSON.stringify(r.body.trace)).not.toContain("AAAA");
    expect((await postJson(app, "/api/extract", { image: "data:image/png;base64,AAAA", box: { x: "a" } })).status).toBe(400);
  });
});
