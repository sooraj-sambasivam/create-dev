import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "../lift/post";
import express from "express";
import { EntitySchema } from "@create/shared";
import { extractEntity, mockEntity, parseEntity } from "./extract";
import { extractRouter } from "./route";

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
});
