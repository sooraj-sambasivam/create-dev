import { describe, expect, it, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ScreenSchema, type ShapeSummary } from "@create/shared";
import { buildMockSketchScreen, withVisionProviderSummary } from "./mock";
import { sketchRouter } from "../routes/sketch";

const sh = (id: string, type: string, x: number, y: number, w: number, h: number, text?: string): ShapeSummary => ({ id, type, x, y, w, h, text });

describe("buildMockSketchScreen", () => {
  const shapes = [
    sh("b", "geo", 40, 400, 200, 50, "Sign up"),
    sh("t", "text", 40, 20, 300, 60, "Welcome home"),
    sh("i", "geo", 40, 120, 300, 200),
    sh("a", "arrow", 0, 0, 10, 10),
    sh("c", "geo", 400, 130, 150, 150, "Card copy"),
  ];
  const out = buildMockSketchScreen(shapes);

  it("is schema valid", () => {
    expect(ScreenSchema.safeParse(out.screen).success).toBe(true);
    const ids: string[] = [];
    const walk = (ns: { id: string; children?: unknown }[]) => ns.forEach((n) => { ids.push(n.id); if (Array.isArray(n.children)) walk(n.children as never); });
    walk(out.screen.children as never);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("orders top to bottom, left to right and keeps copy", () => {
    const json = JSON.stringify(out.screen.children);
    expect(json.indexOf("Welcome home")).toBeLessThan(json.indexOf("Card copy"));
    expect(json.indexOf("Card copy")).toBeLessThan(json.indexOf("Sign up"));
    expect(out.screen.children[1].type).toBe("container"); // image + card share a row
    expect(out.screen.title).toBe("Welcome home");
  });
  it("falls back to the canned mock when empty", () => {
    expect(ScreenSchema.safeParse(buildMockSketchScreen([], "Cafe").screen).success).toBe(true);
  });
  it("names the vision provider on the mock summary", () => {
    const named = withVisionProviderSummary(buildMockSketchScreen(shapes), "grok");
    expect(named.summary.startsWith("Mock mode (grok):")).toBe(true);
    expect(ScreenSchema.safeParse(named.screen).success).toBe(true);
  });
});

describe("POST /api/generate-sketch", () => {
  let server: Server;
  let base = "";
  const prevMock = process.env.MOCK_AI;
  const prevProvider = process.env.VISION_PROVIDER;
  beforeAll(async () => {
    process.env.MOCK_AI = "1";
    process.env.VISION_PROVIDER = "perceptron";
    const app = express();
    app.use("/api", sketchRouter); // mounted before the global 3mb parser, as in index.ts
    app.use(express.json({ limit: "3mb" }));
    app.use((err: { status?: number; message: string }, _q: express.Request, res: express.Response, _n: express.NextFunction) => {
      res.status(err.status ?? 500).json({ error: err.message });
    });
    await new Promise<void>((r) => { server = app.listen(0, () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/generate-sketch`;
  });
  afterAll(() => {
    server.close();
    if (prevMock === undefined) delete process.env.MOCK_AI;
    else process.env.MOCK_AI = prevMock;
    if (prevProvider === undefined) delete process.env.VISION_PROVIDER;
    else process.env.VISION_PROVIDER = prevProvider;
  });
  const post = (body: unknown) => fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("returns a screen in mock mode and names the provider", async () => {
    const prev = process.env.VISION_PROVIDER;
    process.env.VISION_PROVIDER = "perceptron";
    try {
      const r = await post({ image: "iVBORw0KGgo=", shapes: [sh("t", "text", 0, 0, 100, 40, "Hi")] });
      expect(r.status).toBe(200);
      const j = await r.json();
      expect(ScreenSchema.safeParse(j.screen).success).toBe(true);
      expect(j.summary).toContain("perceptron");
    } finally {
      if (prev === undefined) delete process.env.VISION_PROVIDER;
      else process.env.VISION_PROVIDER = prev;
    }
  });
  it("400 on bad body", async () => {
    expect((await post({ shapes: [] })).status).toBe(400);
  });
  it("accepts a body above 3mb", async () => {
    const r = await post({ image: "A".repeat(5 * 1024 * 1024), shapes: [] });
    expect(r.status).toBe(200);
  });
  it("413 on oversize", async () => {
    const r = await post({ image: "A".repeat(11 * 1024 * 1024), shapes: [] });
    expect(r.status).toBe(413);
  });
  it("400 when VISION_PROVIDER is unknown", async () => {
    process.env.VISION_PROVIDER = "nope";
    try {
      const r = await post({ image: "iVBORw0KGgo=", shapes: [] });
      expect(r.status).toBe(400);
      const j = await r.json();
      expect(j.error).toContain("Unknown vision provider");
    } finally {
      process.env.VISION_PROVIDER = "perceptron";
    }
  });
});
