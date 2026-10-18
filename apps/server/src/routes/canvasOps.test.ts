import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { ScreenOpsSchema, applyOps, type CanvasOpsRequest, type Screen } from "@create/shared";
import { canvasOpsRouter } from "./canvasOps";
import { buildMockOps } from "../canvasOps/mock";
import { readSketchWithPerceptron, resetPerceptronCache } from "../canvasOps/perceptron";
import { runCanvasOps } from "../canvasOps/pipeline";
import { indexForY } from "../canvasOps/outline";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

const screen: Screen = {
  title: "Cafe",
  theme: "light",
  font: "sans",
  children: [
    { id: "hero", type: "container", direction: "column", gap: "md", align: "stretch", justify: "start", padding: "xl", background: "none", width: "full", wrap: false, overlay: "dark", children: [
      { id: "hero-title", type: "heading", text: "Welcome", level: 1 },
      { id: "hero-sub", type: "text", text: "Fresh coffee", tone: "default" },
    ] },
    { id: "about", type: "text", text: "About us", tone: "default" },
  ],
};

const base = (over: Partial<CanvasOpsRequest> = {}): CanvasOpsRequest => ({
  image: PNG,
  label: "pricing",
  region: { y: 5000, h: 300 },
  shapes: [],
  screen,
  ...over,
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetPerceptronCache();
});

describe("mock ops", () => {
  it("is deterministic and valid", () => {
    const a = buildMockOps(base());
    const b = buildMockOps(base());
    expect(a).toEqual(b);
    expect(ScreenOpsSchema.safeParse(a.ops).success).toBe(true);
  });

  it("pricing makes a three-card container at the end for a low region", () => {
    const { ops } = buildMockOps(base());
    const op = ops[0]!;
    expect(op.op).toBe("insert");
    if (op.op !== "insert") return;
    expect(op.index).toBe(2);
    const cards = op.node.type === "container" ? op.node.children[1] : null;
    expect(cards?.type === "container" && cards.children.length).toBe(3);
  });

  it("button: X makes a button, other labels a heading and text", () => {
    const btn = buildMockOps(base({ label: "button: Join now" })).ops[0]!;
    expect(btn.op === "insert" && btn.node).toMatchObject({ type: "button", label: "Join now" });
    const sec = buildMockOps(base({ label: "our story" })).ops[0]!;
    expect(sec.op === "insert" && sec.node.type === "container" && sec.node.children.map((c) => c.type)).toEqual(["heading", "text"]);
  });

  it("picks the insert index from region.y", () => {
    expect(indexForY(screen, 0)).toBe(0);
    expect(indexForY(screen, 99999)).toBe(2);
    expect(indexForY(null, 300)).toBe(0);
  });

  it("applies cleanly to the page", () => {
    const { ops } = buildMockOps(base({ label: "button: Go", region: { y: 0, h: 50 } }));
    const r = applyOps(screen, ops);
    expect(r.skipped).toEqual([]);
    expect(r.screen.children[0]?.type).toBe("button");
  });
});

describe("perceptron", () => {
  it("returns null without a key", async () => {
    vi.stubEnv("PERCEPTRON_API_KEY", "");
    expect(await readSketchWithPerceptron(PNG, "x")).toBeNull();
  });

  it("falls back to null on timeout", async () => {
    const fetchImpl = vi.fn((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))),
    ) as unknown as typeof fetch;
    const t = Date.now();
    expect(await readSketchWithPerceptron(PNG, "x", { apiKey: "k", fetchImpl, timeoutMs: 50 })).toBeNull();
    expect(Date.now() - t).toBeLessThan(2000);
  });

  it("reads the completion and verifies the model id", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      if (url.endsWith("/models")) return Response.json({ data: [{ id: "perceptron-mk1.6" }] });
      return Response.json({ choices: [{ message: { content: "button @ center: Sign up" } }] });
    }) as unknown as typeof fetch;
    const text = await readSketchWithPerceptron(PNG, "", { apiKey: "k", fetchImpl });
    expect(text).toContain("Sign up");
    expect(JSON.parse(calls[1]!.body!).model).toBe("perceptron-mk1.6");
  });
});

function fakeClient(inputs: unknown[]) {
  let i = 0;
  const create = vi.fn(async (..._a: unknown[]) => ({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: `t${i}`, name: "apply_ops", input: inputs[Math.min(i++, inputs.length - 1)] }],
  }));
  return { client: { messages: { create } } as unknown as Pick<Anthropic, "messages">, create };
}

describe("claude path", () => {
  const good = {
    summary: "Added a button.",
    ops: [{ op: "insert", parentId: null, index: 1, node: { id: "cta", type: "button", label: "Go" } }],
  };

  it("returns validated ops and includes the reading", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "x");
    vi.stubEnv("PERCEPTRON_API_KEY", "k");
    const { client, create } = fakeClient([good]);
    const fetchImpl = (async (url: string) =>
      url.endsWith("/models") ? Response.json({ data: [] }) : Response.json({ choices: [{ message: { content: "reading text" } }] })) as unknown as typeof fetch;
    const out = await runCanvasOps(base(), { client, perceptron: { fetchImpl } });
    expect(out.provider).toBe("perceptron+claude");
    expect(out.sketchReading).toBe("reading text");
    expect(ScreenOpsSchema.safeParse(out.ops).success).toBe(true);
    const sent = JSON.stringify(create.mock.calls[0]![0]);
    expect(sent).toContain("reading text");
    expect(sent).toContain("hero-title");
  });

  it("repairs once, then fails with 422-class error", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "x");
    vi.stubEnv("PERCEPTRON_API_KEY", "");
    const bad = { summary: "x", ops: [{ op: "remove" }] };
    const repaired = fakeClient([bad, good]);
    expect((await runCanvasOps(base(), { client: repaired.client })).provider).toBe("claude");
    expect(repaired.create).toHaveBeenCalledTimes(2);
    const hopeless = fakeClient([bad, bad]);
    await expect(runCanvasOps(base(), { client: hopeless.client })).rejects.toMatchObject({ status: 422 });
  });
});

describe("POST /api/canvas-ops", () => {
  let server: Server;
  let url: string;
  beforeAll(async () => {
    const app = express();
    app.use("/api", canvasOpsRouter);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", () => r()));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/canvas-ops`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });
  const post = (body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

  it("rejects an invalid body with 400", async () => {
    expect((await post({ label: "x" })).status).toBe(400);
    expect((await post("{nope")).status).toBe(400);
  });

  it("rejects an oversized body with 413", async () => {
    expect((await post(base({ image: "data:image/png;base64," + "A".repeat(11_000_000) }))).status).toBe(413);
  });

  it("answers in mock mode with valid ops", async () => {
    vi.stubEnv("MOCK_AI", "1");
    const res = await post(base({ label: "button: Buy" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe("mock");
    expect(ScreenOpsSchema.safeParse(body.ops).success).toBe(true);
  });
});
