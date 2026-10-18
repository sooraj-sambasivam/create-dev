import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { IntentRequest, IntentResult } from "@create/shared";

const judgeIntent = vi.hoisted(() => vi.fn());
vi.mock("../jev/client", () => ({ judgeIntent }));

import { routeIntentWithEngine } from "./intent";
import { intentRouter } from "../routes/intent";

const candidates: IntentRequest["candidates"] = [{ id: "n1", label: "Pricing heading", kind: "node" }];
const jevResult: IntentResult = { isCommand: true, targetId: "n1", action: "delete", confidence: 0.9 };

afterEach(() => {
  judgeIntent.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MOCK_AI;
});

describe("routeIntentWithEngine with Jev", () => {
  it("reports jev when Jev answers, without calling Haiku", async () => {
    judgeIntent.mockResolvedValue(jevResult);
    const create = vi.fn();
    const client = { messages: { create } } as never;
    const out = await routeIntentWithEngine({ transcript: "delete it", candidates }, { client });
    expect(out).toEqual({ result: jevResult, engine: "jev" });
    expect(create).not.toHaveBeenCalled();
  });

  it("falls through from Jev to Haiku when Jev returns null", async () => {
    judgeIntent.mockResolvedValue(null);
    const create = vi.fn(async () => ({
      content: [{ type: "tool_use", name: "route_intent", input: { isCommand: true, targetId: "n1", action: "delete", confidence: 0.7 } }],
    }));
    const out = await routeIntentWithEngine({ transcript: "delete it", candidates }, { client: { messages: { create } } as never });
    expect(judgeIntent).toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
    expect(out.engine).toBe("haiku");
  });

  it("falls through to keywords when Jev returns a schema-invalid result", async () => {
    judgeIntent.mockResolvedValue({ isCommand: true, targetId: null, action: "bogus", confidence: 5 });
    const out = await routeIntentWithEngine({ transcript: "delete the pricing heading", candidates });
    expect(out.engine).toBe("keywords");
  });

  it("still uses Jev when MOCK_AI=1 (mock mode only gates Claude)", async () => {
    process.env.MOCK_AI = "1";
    judgeIntent.mockResolvedValue(jevResult);
    const out = await routeIntentWithEngine({ transcript: "delete the pricing heading", candidates });
    expect(judgeIntent).toHaveBeenCalled();
    expect(out.engine).toBe("jev");
  });

  it("falls to keywords in mock mode when Jev has no answer", async () => {
    process.env.MOCK_AI = "1";
    judgeIntent.mockResolvedValue(null);
    const out = await routeIntentWithEngine({ transcript: "delete the pricing heading", candidates });
    expect(out.engine).toBe("keywords");
  });
});

describe("route with Jev", () => {
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

  it("sets x-intent-engine: jev and returns the Jev result", async () => {
    judgeIntent.mockResolvedValue(jevResult);
    const res = await fetch(`${base}/api/route-intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "delete it", candidates }),
    });
    expect(res.headers.get("x-intent-engine")).toBe("jev");
    expect(await res.json()).toEqual(jevResult);
  });
});
