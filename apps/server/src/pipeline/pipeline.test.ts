import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deflateSync } from "node:zlib";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { LocateResponseSchema, type AxNode, type CaptureInput, type LocateResult } from "@create/shared";
import { postJson } from "../lift/post";
import { fuse } from "./fuse";
import { iou } from "./geometry";
import { locate } from "./locate";
import { locateRouter } from "./route";
import { readTraces } from "./trace";

function png(w: number, h: number): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  return `data:image/png;base64,${Buffer.concat([head, Buffer.from("IHDR"), ihdr, Buffer.alloc(8), deflateSync(Buffer.alloc(1))]).toString("base64")}`;
}
const IMG = png(1000, 800);
const base = (extra: Partial<CaptureInput> = {}): CaptureInput => ({ source: "notch", image: IMG, imageSize: { w: 1000, h: 800 }, cursor: { x: 500, y: 400 }, ...extra });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const KEYS = ["PERCEPTRON_API_KEY", "TYPESAFE_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "MOCK_AI"];
let dir: string;

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  dir = mkdtempSync(path.join(tmpdir(), "locate-"));
  process.env.TRACE_DIR = dir;
});
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
  delete process.env.TRACE_DIR;
  vi.restoreAllMocks();
});

/** Routes fetch by URL so each provider can be mocked independently. */
function router(handlers: { perceptron?: () => Response; jev?: () => Response; gemini?: () => Response }) {
  return vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("perceptron")) return handlers.perceptron?.() ?? json({}, 500);
    if (u.includes("typesafe")) return handlers.jev?.() ?? json({}, 500);
    if (u.includes("googleapis")) return handlers.gemini?.() ?? json({}, 500);
    return json({}, 404);
  });
}
const det = (mention: string, x1: number, y1: number, x2: number, y2: number) => ({ mention, point_box: { top_left: { x: x1, y: y1 }, bottom_right: { x: x2, y: y2 } } });
const gem = (boxes: unknown[]) => json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ boxes }) }] } }] });
const jevOk = (noul: number, box = { top: 0.25, bottom: 0.75, left: 0.2, right: 0.8 }) => json({ answers: { present: { noul }, where: { box } } });
const deps = (fetchImpl: unknown) => ({ fetchImpl: fetchImpl as typeof fetch, graceMs: 50 });

describe("geometry + fusion", () => {
  it("computes IoU", () => {
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(1);
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 5, h: 5 })).toBe(0);
  });
  const r = (source: LocateResult["source"], x: number, conf: number, kind: LocateResult["kind"] = "table"): LocateResult => ({ box: { x, y: 0, w: 100, h: 100 }, kind, label: `${source}`, source, confidence: conf });
  it("adds an agreement bonus and marks the result fused", () => {
    const solo = fuse([r("perceptron", 0, 0.7)]);
    const agree = fuse([r("perceptron", 0, 0.7), r("gemini", 5, 0.7)]);
    expect(solo.result?.source).toBe("perceptron");
    expect(agree.result?.source).toBe("fused");
    expect(agree.result!.confidence).toBeGreaterThan(solo.result!.confidence);
    expect(agree.ask).toBeUndefined();
  });
  it("asks Which one? when two distinct boxes are close, and returns both candidates", () => {
    const o = fuse([r("perceptron", 0, 0.8), r("gemini", 500, 0.85, "chart")]);
    expect(o.ask).toMatch(/^Which one\? \(A: .* or B: .*\)$/);
    expect(o.result?.candidates).toHaveLength(2);
  });
  it("does not ask when the winner is clearly ahead, and never silently misses", () => {
    expect(fuse([r("ax", 0, 0.95), r("gemini", 500, 0.4)]).ask).toBeUndefined();
    const miss = fuse([]);
    expect(miss.result).toBeNull();
    expect(miss.ask).toMatch(/^Which one\?/);
    expect(fuse([r("claude", 0, 0.2)]).ask).toBeTruthy();
  });
  it("down-weights a box that does not contain the cursor", () => {
    const o = fuse([r("perceptron", 0, 0.8), r("gemini", 600, 0.8)], { x: 50, y: 50 });
    expect(o.result?.box.x).toBe(0);
  });
});

describe("providers", () => {
  const axTree: AxNode = {
    role: "AXWindow",
    frame: { x: 0, y: 0, w: 1000, h: 800 },
    children: [{ role: "AXScrollArea", frame: { x: 0, y: 0, w: 1000, h: 800 }, children: [{ role: "AXTable", title: "Sales", frame: { x: 100, y: 100, w: 600, h: 400 }, children: [{ role: "AXCell", frame: { x: 480, y: 380, w: 60, h: 30 } }] }] }],
  };
  it("AX table frame wins fast and skips pixel providers", async () => {
    const f = router({});
    const res = await locate(base({ ax: axTree }), undefined, { ...deps(f), writeTrace: false });
    expect(res.result).toMatchObject({ source: "ax", kind: "table", label: "Sales", box: { x: 100, y: 100, w: 600, h: 400 } });
    expect(res.result!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(f).not.toHaveBeenCalled();
    expect(LocateResponseSchema.safeParse(res).success).toBe(true);
  });
  it("DOM rect is used when it holds the cursor", async () => {
    const dom = { tag: "TABLE", text: "Fares", rect: { x: 400, y: 300, w: 300, h: 200 }, selectorPath: "table", tableLike: true };
    const res = await locate(base({ dom, image: undefined }), undefined, { writeTrace: false });
    expect(res.result).toMatchObject({ source: "dom", kind: "table" });
  });
  it("Perceptron /v1/detect: sends categories, picks the box under the cursor, rescales", async () => {
    process.env.PERCEPTRON_API_KEY = "pk";
    const f = router({ perceptron: () => json({ detections: [det("chart", 0, 0, 100, 100), det("table", 100, 100, 700, 600)], finish_reason: "complete" }) });
    const res = await locate(base({ imageSize: { w: 2000, h: 1600 }, cursor: { x: 1000, y: 800 } }), ["perceptron"], deps(f));
    expect(res.result).toMatchObject({ source: "perceptron", kind: "table", box: { x: 200, y: 200, w: 1200, h: 1000 } });
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("https://api.perceptron.inc/v1/detect");
    expect(JSON.parse(init.body).categories).toContain("table");
    expect(JSON.parse(init.body).config.output).toBe("box");
    expect(JSON.stringify(res.trace)).not.toContain("pk");
  });
  it("Jev: multipart with danger-zone header; low yes/no gate yields nothing but is not an error", async () => {
    process.env.TYPESAFE_API_KEY = "tk";
    const f = router({ jev: () => jevOk(0.95) });
    const ok = await locate(base(), ["jev"], deps(f));
    expect(ok.result).toMatchObject({ source: "jev", box: { x: 200, y: 200, w: 600, h: 400 } });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["TypeSafe-Danger-Zone-Images"]).toBe("true");
    expect(init.body).toBeInstanceOf(FormData);
    const no = await locate(base(), ["jev"], deps(router({ jev: () => jevOk(0.1) })));
    expect(no.result).toBeNull();
    expect(no.ask).toMatch(/^Which one\?/);
    expect(no.trace.stages.find((s) => s.provider === "jev")?.ok).toBe(true);
  });
  it("Jev outside size limits is reported as a stage error", async () => {
    process.env.TYPESAFE_API_KEY = "tk";
    const res = await locate(base({ image: png(2400, 1600), imageSize: { w: 2400, h: 1600 } }), ["jev"], deps(router({})));
    expect(res.trace.stages.find((s) => s.provider === "jev")).toMatchObject({ ok: false });
    expect(res.ask).toBeTruthy();
  });
  it("Gemini: converts [ymin,xmin,ymax,xmax] 0-1000 to pixels", async () => {
    process.env.GEMINI_API_KEY = "gk";
    const f = router({ gemini: () => gem([{ label: "Pricing", kind: "table", box_2d: [250, 200, 750, 800] }]) });
    const res = await locate(base(), ["gemini"], deps(f));
    expect(res.result).toMatchObject({ source: "gemini", kind: "table", label: "Pricing", box: { x: 200, y: 200, w: 600, h: 400 } });
    expect(JSON.stringify(res.trace)).not.toContain("gk");
  });
  it("Claude vision runs last, only when nothing else is usable", async () => {
    const create = vi.fn(async () => ({ content: [{ type: "text", text: JSON.stringify({ boxes: [{ label: "grid", kind: "table", box_2d: [100, 100, 900, 900] }] }) }] }));
    const client = { messages: { create } } as never;
    const res = await locate(base(), undefined, { client, graceMs: 20, writeTrace: false, fetchImpl: router({}) as never });
    expect(res.result).toMatchObject({ source: "claude", box: { x: 100, y: 80, w: 800, h: 640 } });
    const claudeIdx = res.trace.stages.findIndex((s) => s.provider === "claude");
    const fuseIdx = res.trace.stages.findIndex((s) => s.provider === "fuse");
    expect(claudeIdx).toBeGreaterThan(-1);
    expect(claudeIdx).toBeLessThan(fuseIdx);
    // not called when a confident box exists
    process.env.GEMINI_API_KEY = "gk";
    create.mockClear();
    await locate(base(), undefined, { client, graceMs: 20, writeTrace: false, fetchImpl: router({ gemini: () => gem([{ label: "t", kind: "table", box_2d: [250, 200, 750, 800] }]) }) as never });
    expect(create).not.toHaveBeenCalled();
  });
  it("a provider timeout is recorded, not thrown", async () => {
    process.env.PERCEPTRON_API_KEY = "pk";
    const slow = vi.fn((_u: unknown, init: RequestInit) => new Promise<Response>((_, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted")))));
    const res = await locate(base(), ["perceptron"], { fetchImpl: slow as never, timeouts: { perceptron: 30 }, writeTrace: false });
    expect(res.trace.stages.find((s) => s.provider === "perceptron")).toMatchObject({ ok: false, error: "timeout after 30ms" });
    expect(res.result).toBeNull();
    expect(res.ask).toMatch(/^Which one\?/);
  });
  it("fuses agreeing providers and asks when they disagree", async () => {
    process.env.PERCEPTRON_API_KEY = "pk";
    process.env.GEMINI_API_KEY = "gk";
    process.env.TYPESAFE_API_KEY = "tk";
    const agree = router({
      perceptron: () => json({ detections: [det("table", 200, 200, 800, 600)] }),
      gemini: () => gem([{ label: "t", kind: "table", box_2d: [250, 210, 750, 790] }]),
      jev: () => jevOk(0.9),
    });
    const a = await locate(base(), undefined, deps(agree));
    expect(a.result?.source).toBe("fused");
    expect(a.ask).toBeUndefined();
    const differ = router({
      perceptron: () => json({ detections: [det("table", 10, 10, 300, 300)] }),
      gemini: () => gem([{ label: "revenue", kind: "chart", box_2d: [300, 600, 900, 990] }]),
    });
    const d = await locate(base({ cursor: undefined }), ["perceptron", "gemini"], deps(differ));
    expect(d.ask).toMatch(/^Which one\?/);
    expect(d.result?.candidates?.length).toBe(2);
  });
});

describe("trace + route", () => {
  it("writes JSON lines with timings and no image bytes; /api/traces returns them", async () => {
    process.env.GEMINI_API_KEY = "gk";
    const f = router({ gemini: () => gem([{ label: "t", kind: "table", box_2d: [250, 200, 750, 800] }]) });
    const res = await locate(base({ hint: "bus times" }), ["gemini"], deps(f));
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^pipeline-\d{8}\.jsonl$/);
    const text = readFileSync(path.join(dir, files[0]!), "utf8");
    expect(text).not.toContain("base64");
    expect(text).not.toContain("gk");
    expect(JSON.parse(text.trim()).id).toBe(res.trace.id);
    expect(res.trace.stages.map((s) => s.stage)).toContain("capture");
    expect((await readTraces(10))[0]?.id).toBe(res.trace.id);
  });
  it("POST /api/locate validates; GET /api/traces is dev only", async () => {
    const app = express().use("/api", locateRouter);
    expect((await postJson(app, "/api/locate", {})).status).toBe(400);
    expect((await postJson(app, "/api/locate", { input: { source: "notch", image: "not-a-data-url" } })).status).toBe(400);
    const ok = await postJson(app, "/api/locate", { input: { source: "extension", dom: { tag: "table", text: "x", rect: { x: 0, y: 0, w: 50, h: 50 }, selectorPath: "t", tableLike: true }, cursor: { x: 5, y: 5 } } });
    expect(ok.status).toBe(200);
    expect(ok.body.result.source).toBe("dom");
    const server = app.listen(0);
    try {
      const port = (server.address() as { port: number }).port;
      const list = await (await fetch(`http://127.0.0.1:${port}/api/traces?limit=5`)).json();
      expect(list.traces.length).toBeGreaterThan(0);
      process.env.NODE_ENV = "production";
      expect((await fetch(`http://127.0.0.1:${port}/api/traces`)).status).toBe(404);
    } finally {
      process.env.NODE_ENV = "test";
      server.close();
    }
  });
});

describe("fusion: viewport-sized boxes", () => {
  it("prefers a smaller box over a whole-window box from a higher-prior source", () => {
    const win: LocateResult = { box: { x: 0, y: 0, w: 1440, h: 900 }, kind: "other", label: "window", source: "ax", confidence: 0.6 };
    const cell: LocateResult = { box: { x: 100, y: 100, w: 100, h: 30 }, kind: "table", label: "cell", source: "jev", confidence: 0.9 };
    const o = fuse([win, cell], { x: 120, y: 110 }, { w: 1440, h: 900 });
    expect(o.result?.box.w).toBe(100);
  });
});
