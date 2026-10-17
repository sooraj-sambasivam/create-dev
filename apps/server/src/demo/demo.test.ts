import { describe, expect, it, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DemoRequestSchema, ScreenSchema, walkNodes, type DemoChunk, type DemoRequest } from "@create/shared";
import { mockGenerate } from "@create/shared";
import { runDemo } from "./run";
import { abortable } from "./real";
import { demoRouter } from "../routes/demo";

const session = (): DemoRequest["session"] => ({
  id: "s1",
  context: "page",
  startedAt: 0,
  endedAt: 9000,
  snapshots: [],
  events: [
    { t: 100, kind: "speech", text: "I want a bakery landing page", final: false },
    { t: 200, kind: "speech", text: "I want a bakery landing page with a menu.", final: true },
    { t: 1500, kind: "lasso", rect: { x: 0, y: 0, w: 10, h: 10 }, targets: [{ id: "hero", label: "menu section", kind: "node" }] },
    { t: 2000, kind: "speech", text: "Show our fresh sourdough and pastries here.", final: true },
    { t: 3000, kind: "note", text: "Opening hours" },
  ],
});

async function collect(req: DemoRequest, mock = true): Promise<DemoChunk[]> {
  const out: DemoChunk[] = [];
  await runDemo(req, (c) => { out.push(c); }, { mock });
  return out;
}

describe("DemoRequestSchema", () => {
  it("accepts a session and rejects a bad one", () => {
    expect(DemoRequestSchema.safeParse({ session: session() }).success).toBe(true);
    expect(DemoRequestSchema.safeParse({}).success).toBe(false);
    expect(DemoRequestSchema.safeParse({ session: { ...session(), context: "nope" } }).success).toBe(false);
  });
});

describe("runDemo (mock)", () => {
  it("streams monotonic steps then a schema-valid result", async () => {
    const chunks = await collect({ session: session() });
    const steps = chunks.filter((c): c is Extract<DemoChunk, { type: "step" }> => c.type === "step");
    expect(steps[0].label).toMatch(/Reading/);
    expect(steps[0].pct).toBe(5);
    expect(steps.map((s) => s.pct)).toEqual([...steps.map((s) => s.pct)].sort((a, b) => a - b));
    expect(steps.at(-1)!.pct).toBe(97);
    const last = chunks.at(-1)!;
    expect(last.type).toBe("result");
    if (last.type !== "result") return;
    expect(last.mock).toBe(true);
    expect(ScreenSchema.safeParse(last.screen).success).toBe(true);
    expect(last.screen.title).toBe("I Want A Bakery Landing Page");
    // unique ids and working nav anchors
    const ids: string[] = [];
    walkNodes(last.screen.children, (n) => ids.push(n.id));
    expect(new Set(ids).size).toBe(ids.length);
    const hrefs: string[] = [];
    walkNodes(last.screen.children, (n) => { if (n.type === "link" && n.href?.startsWith("#")) hrefs.push(n.href.slice(1)); });
    expect(hrefs.length).toBeGreaterThan(0);
    hrefs.forEach((h) => expect(ids).toContain(h));
    expect(JSON.stringify(last.screen)).toContain("Menu Section");
  });

  it("is deterministic", async () => {
    const a = await collect({ session: session() });
    const b = await collect({ session: session() });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("reuses the current screen and keeps ids unique", async () => {
    const current = mockGenerate("Bakery").screen;
    const chunks = await collect({ session: session(), screen: current });
    const last = chunks.at(-1)!;
    expect(last.type).toBe("result");
    if (last.type !== "result") return;
    expect(ScreenSchema.safeParse(last.screen).success).toBe(true);
    expect(last.screen.children.slice(0, current.children.length).map((c) => c.id)).toEqual(current.children.map((c) => c.id));
    expect(last.screen.children.length).toBeGreaterThan(current.children.length);
    const ids: string[] = [];
    walkNodes(last.screen.children, (n) => ids.push(n.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("handles an empty session", async () => {
    const chunks = await collect({ session: { ...session(), events: [] } });
    const last = chunks.at(-1)!;
    expect(last.type).toBe("result");
    if (last.type === "result") expect(ScreenSchema.safeParse(last.screen).success).toBe(true);
  });
});

describe("POST /api/demo", () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    process.env.MOCK_AI = "1";
    const app = express();
    app.use("/api", demoRouter);
    await new Promise<void>((r) => { server = app.listen(0, () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); });

  it("rejects an invalid body with 400", async () => {
    const res = await fetch(`${base}/api/demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: {} }) });
    expect(res.status).toBe(400);
  });

  it("streams NDJSON ending with a result", async () => {
    const res = await fetch(`${base}/api/demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: session() }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as DemoChunk);
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.at(-1)!.type).toBe("result");
  });
});

describe("abort", () => {
  it("abortable rejects as soon as the signal fires", async () => {
    const ac = new AbortController();
    const p = abortable(new Promise<string>(() => {}), ac.signal);
    ac.abort(new Error("gone"));
    await expect(p).rejects.toThrow("gone");
  });

  it("abortable passes through the result when not aborted", async () => {
    await expect(abortable(Promise.resolve(7), new AbortController().signal)).resolves.toBe(7);
  });

  it("runDemo emits no result once the signal is aborted", async () => {
    const ac = new AbortController();
    const out: DemoChunk[] = [];
    await runDemo({ session: session() }, (c) => { out.push(c); if (c.type === "step") ac.abort(); }, { mock: true, signal: ac.signal });
    expect(out.some((c) => c.type === "result")).toBe(false);
  });
});
