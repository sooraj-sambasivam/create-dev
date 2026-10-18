import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mockGenerate, ScreenSchema } from "@create/shared";

const claude = vi.hoisted(() => ({ generateWithClaude: vi.fn() }));
vi.mock("../ai/claude", async (orig) => ({
  ...(await orig<typeof import("../ai/claude")>()),
  generateWithClaude: claude.generateWithClaude,
  editNodeWithClaude: vi.fn(),
}));

import { GenerationError } from "../ai/claude";
import { generateRouter } from "./generate";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", generateRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/generate`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  process.env.MOCK_AI = "1";
  claude.generateWithClaude.mockReset();
});
afterEach(() => {
  process.env.MOCK_AI = "1";
});

const post = (body: unknown, signal?: AbortSignal) =>
  fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });

async function frames(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("POST /api/generate stream:true (mock mode)", () => {
  it("emits growing partials, then done with the full screen", async () => {
    const full = mockGenerate("Coffee").screen;
    const res = await post({ prompt: "Coffee", stream: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/x-ndjson/);
    const out = await frames(res);
    const partials = out.slice(0, -1);
    const done = out[out.length - 1]!;
    expect(partials.length).toBeGreaterThan(0);
    let prev = 0;
    for (const p of partials) {
      expect(p.type).toBe("partial");
      const screen = ScreenSchema.parse(p.screen);
      expect(screen.children.length).toBeGreaterThan(prev);
      expect(screen.children).toEqual(full.children.slice(0, screen.children.length));
      prev = screen.children.length;
    }
    expect(done.type).toBe("done");
    expect(typeof done.summary).toBe("string");
    expect(ScreenSchema.parse(done.screen).children).toHaveLength(full.children.length);
  });

  it("stays plain JSON when stream is absent or false", async () => {
    for (const body of [{ prompt: "x" }, { prompt: "x", stream: false }]) {
      const res = await post(body);
      expect(res.headers.get("content-type")).toMatch(/application\/json/);
      expect(((await res.json()) as { screen: unknown }).screen).toBeTruthy();
    }
  });
});

describe("POST /api/generate stream:true (real path, mocked model)", () => {
  beforeEach(() => {
    process.env.MOCK_AI = "0";
  });

  it("relays partials from the model, then done", async () => {
    const result = mockGenerate("x");
    claude.generateWithClaude.mockImplementation(async (_req, opts) => {
      opts.onPartial({ ...result.screen, children: result.screen.children.slice(0, 1) });
      return result;
    });
    const out = await frames(await post({ prompt: "x", stream: true }));
    expect(out.map((f) => f.type)).toEqual(["partial", "done"]);
  });

  it("turns an error after the first frame into an error line", async () => {
    const result = mockGenerate("x");
    claude.generateWithClaude.mockImplementation(async (_req, opts) => {
      opts.onPartial({ ...result.screen, children: result.screen.children.slice(0, 1) });
      throw new GenerationError("The page was too large to finish.", 422);
    });
    const res = await post({ prompt: "x", stream: true });
    expect(res.status).toBe(200);
    const out = await frames(res);
    expect(out.map((f) => f.type)).toEqual(["partial", "error"]);
    expect(out[1]!.message).toBe("The page was too large to finish.");
  });

  it("keeps JSON status codes for errors before any frame", async () => {
    claude.generateWithClaude.mockRejectedValue(new GenerationError("No key", 503));
    const res = await post({ prompt: "x", stream: true });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "No key" });
  });

  it("aborts the model call when the client disconnects", async () => {
    let signal: AbortSignal | undefined;
    const aborted = new Promise<void>((resolve) => {
      claude.generateWithClaude.mockImplementation(
        (_req, opts) =>
          new Promise((_, reject) => {
            signal = opts.signal;
            const result = mockGenerate("x");
            opts.onPartial({ ...result.screen, children: result.screen.children.slice(0, 1) });
            opts.signal.addEventListener("abort", () => {
              resolve();
              reject(new GenerationError("Request cancelled.", 499));
            });
          }),
      );
    });
    const ac = new AbortController();
    const res = await post({ prompt: "x", stream: true }, ac.signal);
    const reader = res.body!.getReader();
    await reader.read(); // first partial arrived
    ac.abort();
    await aborted;
    expect(signal?.aborted).toBe(true);
  });
});
