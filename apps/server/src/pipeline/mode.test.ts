import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deflateSync } from "node:zlib";
import { LocateRequestSchema, type CaptureInput } from "@create/shared";
import { COMMIT_PERCEPTRON_TIMEOUT_MS, locate } from "./locate";

function png(w: number, h: number): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  return `data:image/png;base64,${Buffer.concat([head, Buffer.from("IHDR"), ihdr, Buffer.alloc(8), deflateSync(Buffer.alloc(1))]).toString("base64")}`;
}
const input: CaptureInput = { source: "notch", image: png(1000, 800), imageSize: { w: 1000, h: 800 }, cursor: { x: 500, y: 400 } };
const KEYS = ["PERCEPTRON_API_KEY", "TYPESAFE_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"];
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  process.env.PERCEPTRON_API_KEY = "test";
  process.env.GEMINI_API_KEY = "test";
});
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
  vi.restoreAllMocks();
});

const fetchMock = () =>
  vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("perceptron")) return json({ detections: [{ mention: "table", point_box: { top_left: { x: 200, y: 200 }, bottom_right: { x: 800, y: 600 } } }] });
    return json({}) ;
  });

describe("locate mode", () => {
  it("accepts mode on the request schema and rejects unknown values", () => {
    expect(LocateRequestSchema.safeParse({ input: { source: "app" }, mode: "commit" }).success).toBe(true);
    expect(LocateRequestSchema.safeParse({ input: { source: "app" }, mode: "x" }).success).toBe(false);
    expect(LocateRequestSchema.safeParse({ input: { source: "app" } }).success).toBe(true);
  });

  it("hover never calls Perceptron or Gemini", async () => {
    const f = fetchMock();
    const res = await locate(input, undefined, { mode: "hover", fetchImpl: f as never, writeTrace: false });
    expect(f.mock.calls.some(([u]) => String(u).includes("perceptron") || String(u).includes("googleapis"))).toBe(false);
    expect(res.trace.stages.some((s) => s.provider === "perceptron")).toBe(false);
  });

  it("commit calls Perceptron and waits for it past the grace window", async () => {
    const f = fetchMock();
    const res = await locate(input, undefined, { mode: "commit", fetchImpl: f as never, writeTrace: false });
    expect(f.mock.calls.some(([u]) => String(u).includes("api.perceptron.inc/v1/detect"))).toBe(true);
    expect(res.result?.source).toBe("perceptron");
  });

  it("commit gives Perceptron an 8 s cap", () => {
    expect(COMMIT_PERCEPTRON_TIMEOUT_MS).toBe(8000);
  });
});
