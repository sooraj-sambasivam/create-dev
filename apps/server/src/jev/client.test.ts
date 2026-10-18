import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { IntentRequest } from "@create/shared";
import { judgeIntent, resetJevClient } from "./client";
import { routeIntentWithEngine } from "../intent/intent";
import { intentRouter } from "../routes/intent";

const candidates: IntentRequest["candidates"] = [
  { id: "n1", label: "Pricing heading", kind: "node" },
  { id: "s9", label: "blue rectangle", kind: "shape" },
];
const req: IntentRequest = { transcript: "make the blue rectangle red", candidates };

const answers = (p: { cmd: number; target: string; pt: number; action: string; pa: number }) => ({
  model: "jev-latest",
  usage: { input_tokens: 1, output_tokens: 1 },
  answers: {
    isInstruction: { type: "noul", noul: p.cmd },
    target: { type: "choice", choice: p.target, confidence: p.pt, probabilities: { [p.target]: p.pt } },
    action: { type: "choice", choice: p.action, confidence: p.pa, probabilities: { [p.action]: p.pa } },
  },
});
const fake = (impl: () => unknown) => ({ systemOne: vi.fn(async () => impl()) }) as never;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetJevClient();
  delete process.env.TYPESAFE_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MOCK_AI;
  vi.restoreAllMocks();
});

describe("judgeIntent", () => {
  it("maps answers to an IntentResult with min confidence", async () => {
    const client = fake(() => answers({ cmd: 0.95, target: "c2", pt: 0.8, action: "restyle", pa: 0.9 }));
    expect(await judgeIntent(req, { client })).toEqual({ isCommand: true, targetId: "s9", action: "restyle", confidence: 0.8 });
  });

  it("returns a non-command when the instruction probability is low", async () => {
    const client = fake(() => answers({ cmd: 0.1, target: "none", pt: 0.9, action: "none", pa: 0.9 }));
    expect(await judgeIntent(req, { client })).toEqual({ isCommand: false, targetId: null, action: "none", confidence: 0.9 });
  });

  it("maps a 'none' target to null targetId", async () => {
    const client = fake(() => answers({ cmd: 0.9, target: "none", pt: 0.7, action: "add", pa: 0.9 }));
    expect(await judgeIntent(req, { client })).toMatchObject({ isCommand: true, targetId: null, action: "add", confidence: 0.7 });
  });

  it("returns null for an invalid target", async () => {
    const client = fake(() => answers({ cmd: 0.9, target: "c99", pt: 0.9, action: "delete", pa: 0.9 }));
    expect(await judgeIntent(req, { client })).toBeNull();
  });

  it("returns null on SDK error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = { systemOne: vi.fn(async () => { throw new Error("boom"); }) } as never;
    expect(await judgeIntent(req, { client })).toBeNull();
  });

  it("aborts after the timeout and returns null", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = {
      systemOne: vi.fn((_r: unknown, o: { signal: AbortSignal }) =>
        new Promise((_, reject) => o.signal.addEventListener("abort", () => reject(new Error("aborted"))))),
    } as never;
    const p = judgeIntent(req, { client });
    await vi.advanceTimersByTimeAsync(1600);
    expect(await p).toBeNull();
  });

  it("returns null for missing or NaN probabilities", async () => {
    const missing = answers({ cmd: 0.9, target: "c1", pt: 0.9, action: "delete", pa: 0.9 });
    delete (missing.answers.action as { probabilities?: unknown }).probabilities;
    expect(await judgeIntent(req, { client: fake(() => missing) })).toBeNull();
    expect(await judgeIntent(req, { client: fake(() => answers({ cmd: 0.9, target: "c1", pt: NaN, action: "delete", pa: 0.9 })) })).toBeNull();
  });

  it("returns null when isInstruction.noul is outside 0-1", async () => {
    expect(await judgeIntent(req, { client: fake(() => answers({ cmd: 1.5, target: "c1", pt: 0.9, action: "delete", pa: 0.9 })) })).toBeNull();
    expect(await judgeIntent(req, { client: fake(() => answers({ cmd: -0.2, target: "c1", pt: 0.9, action: "delete", pa: 0.9 })) })).toBeNull();
  });

  it("returns null when action is none but the line is an instruction", async () => {
    const client = fake(() => answers({ cmd: 0.9, target: "c1", pt: 0.9, action: "none", pa: 0.9 }));
    expect(await judgeIntent(req, { client })).toBeNull();
  });

  it("omits the target question and returns a null target with empty candidates", async () => {
    const systemOne = vi.fn(async (_r: unknown) => {
      const a = answers({ cmd: 0.9, target: "x", pt: 0.9, action: "add", pa: 0.8 });
      return { ...a, answers: { isInstruction: a.answers.isInstruction, action: a.answers.action } };
    });
    const out = await judgeIntent({ transcript: "add a section", candidates: [] }, { client: { systemOne } as never });
    expect(out).toEqual({ isCommand: true, targetId: null, action: "add", confidence: 0.8 });
    const sent = systemOne.mock.calls[0]![0] as { questions: Record<string, unknown> };
    expect(Object.keys(sent.questions).sort()).toEqual(["action", "isInstruction"]);
  });

  it("is skipped with no key", async () => {
    expect(await judgeIntent(req)).toBeNull();
  });
});

describe("routeIntentWithEngine", () => {
  it("reports keywords when no keys are set", async () => {
    const { engine, result } = await routeIntentWithEngine({ transcript: "delete the pricing heading", candidates });
    expect(engine).toBe("keywords");
    expect(result.action).toBe("delete");
  });

  it("falls through from a failing Jev to keywords", async () => {
    process.env.TYPESAFE_API_KEY = "tk-test";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => { throw new Error("net"); });
    vi.stubGlobal("fetch", fetchMock);
    const { engine } = await routeIntentWithEngine({ transcript: "delete the pricing heading", candidates });
    expect(fetchMock).toHaveBeenCalled();
    expect(engine).toBe("keywords");
  });
});

describe("x-intent-engine header", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api", intentRouter);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  it("sets the engine header and keeps the body shape", async () => {
    const res = await fetch(`${base}/api/route-intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "delete the pricing heading", candidates }),
    });
    expect(res.headers.get("x-intent-engine")).toBe("keywords");
    expect(Object.keys(await res.json()).sort()).toEqual(["action", "confidence", "isCommand", "targetId"]);
  });
});
