import express from "express";
import type Anthropic from "@anthropic-ai/sdk";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { IntentRequest } from "@create/shared";
import { intentRouter } from "./intent";
import { routeIntent, routeIntentFallback, routeIntentWithClaude, sanitizeIntent } from "../intent/intent";

const candidates: IntentRequest["candidates"] = [
  { id: "n1", label: "Pricing heading", kind: "node" },
  { id: "n2", label: "Sign up button", kind: "node" },
  { id: "s9", label: "blue rectangle", kind: "shape" },
];

const req = (transcript: string, c = candidates): IntentRequest => ({ transcript, candidates: c });

/** Fake SDK client: records the request and returns a canned Message. */
function fakeClient(response: unknown) {
  const create = vi.fn(async (..._args: unknown[]) => response);
  return { client: { messages: { create } } as unknown as Anthropic, create };
}

const toolUse = (input: unknown) => ({
  content: [{ type: "tool_use", id: "t1", name: "route_intent", input }],
});

describe("keyword fallback", () => {
  it("treats filler-only speech as not a command", () => {
    const r = routeIntentFallback(req("um, uh... yeah so"));
    expect(r.isCommand).toBe(false);
    expect(r.targetId).toBeNull();
    expect(r.action).toBe("none");
  });

  it("maps verbs to actions", () => {
    expect(routeIntentFallback(req("delete the sign up button")).action).toBe("delete");
    expect(routeIntentFallback(req("move the pricing heading left")).action).toBe("move");
    expect(routeIntentFallback(req("add a footer")).action).toBe("add");
    expect(routeIntentFallback(req("make it bigger")).action).toBe("restyle");
    expect(routeIntentFallback(req("rewrite this as a question")).action).toBe("replace_text");
    expect(routeIntentFallback(req("start over and regenerate")).action).toBe("regenerate");
  });

  it("uses the only candidate as the target", () => {
    const r = routeIntentFallback(req("make it bold", [{ id: "only", label: "Hero", kind: "node" }]));
    expect(r).toMatchObject({ isCommand: true, targetId: "only", action: "restyle" });
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it("matches the target by label words and leaves it null on a tie", () => {
    expect(routeIntentFallback(req("delete the sign up button")).targetId).toBe("n2");
    expect(routeIntentFallback(req("make the blue rectangle round")).targetId).toBe("s9");
    const tie = routeIntentFallback(req("delete the heading", [
      { id: "a", label: "Hero heading", kind: "node" },
      { id: "b", label: "Pricing heading", kind: "node" },
    ]));
    expect(tie.isCommand).toBe(true);
    expect(tie.targetId).toBeNull();
  });

  it("says no when nothing matches a command cue", () => {
    const r = routeIntentFallback(req("so the weather was lovely today"));
    expect(r.isCommand).toBe(false);
    expect(r.action).toBe("none");
  });

  it("always returns confidence in 0..1", () => {
    for (const t of ["delete it", "um", "make it red", "hello there"]) {
      const c = routeIntentFallback(req(t)).confidence;
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe("sanitizeIntent", () => {
  it("rejects a targetId that is not a candidate", () => {
    const r = sanitizeIntent({ isCommand: true, targetId: "ghost", action: "delete", confidence: 0.8 }, candidates);
    expect(r.targetId).toBeNull();
    expect(r.action).toBe("delete");
  });

  it("clamps confidence into 0..1", () => {
    expect(sanitizeIntent({ isCommand: true, targetId: "n1", action: "add", confidence: 7 }, candidates).confidence).toBe(1);
    expect(sanitizeIntent({ isCommand: true, targetId: "n1", action: "add", confidence: -2 }, candidates).confidence).toBe(0);
    expect(sanitizeIntent({ isCommand: true, targetId: "n1", action: "add", confidence: "NaN" }, candidates).confidence).toBe(0);
  });

  it("drops target and action for a non-command, and repairs bad actions", () => {
    const r = sanitizeIntent({ isCommand: false, targetId: "n1", action: "delete", confidence: 0.4 }, candidates);
    expect(r).toEqual({ isCommand: false, targetId: null, action: "none", confidence: 0.4 });
    expect(sanitizeIntent({ isCommand: true, targetId: "n1", action: "explode", confidence: 0.5 }, candidates).action).toBe("none");
  });
});

describe("routeIntentWithClaude", () => {
  it("forces the route_intent tool and sanitizes its input", async () => {
    const { client, create } = fakeClient(toolUse({ isCommand: true, targetId: "n2", action: "delete", confidence: 1.5 }));
    const r = await routeIntentWithClaude(req("remove that button"), client);
    expect(r).toEqual({ isCommand: true, targetId: "n2", action: "delete", confidence: 1 });
    const params = create.mock.calls[0]![0] as unknown as { model: string; tool_choice: unknown; tools: { name: string }[] };
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.tool_choice).toEqual({ type: "tool", name: "route_intent" });
    expect(params.tools[0]!.name).toBe("route_intent");
  });

  it("throws when the model returns no tool call", async () => {
    const { client } = fakeClient({ content: [{ type: "text", text: "hm" }] });
    await expect(routeIntentWithClaude(req("delete it"), client)).rejects.toThrow(/route_intent/);
  });
});

describe("routeIntent", () => {
  afterEach(() => {
    delete process.env.MOCK_AI;
    delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it("uses the keyword router in mock mode without calling the model", async () => {
    process.env.MOCK_AI = "1";
    process.env.ANTHROPIC_API_KEY = "sk-x";
    const { client, create } = fakeClient(toolUse({ isCommand: true, targetId: "n1", action: "add", confidence: 0.9 }));
    const r = await routeIntent(req("add a footer"), { client });
    expect(create).not.toHaveBeenCalled();
    expect(r.action).toBe("add");
  });

  it("uses the keyword router when no key is set", async () => {
    const r = await routeIntent(req("delete the sign up button"));
    expect(r).toMatchObject({ isCommand: true, targetId: "n2", action: "delete" });
  });

  it("falls back to the keyword router when the model call throws", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-x";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = { messages: { create: vi.fn(async () => { throw new Error("boom"); }) } } as unknown as Anthropic;
    const r = await routeIntent(req("delete the sign up button"), { client });
    expect(r).toMatchObject({ isCommand: true, targetId: "n2", action: "delete" });
  });

  it("returns the model answer when the call succeeds", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-x";
    const { client } = fakeClient(toolUse({ isCommand: true, targetId: "s9", action: "restyle", confidence: 0.7 }));
    const r = await routeIntent(req("make it red"), { client });
    expect(r).toEqual({ isCommand: true, targetId: "s9", action: "restyle", confidence: 0.7 });
  });
});

describe("POST /api/route-intent", () => {
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

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("rejects an invalid body with 400", async () => {
    const res = await fetch(`${base}/api/route-intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "", candidates: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("answers with an IntentResult in mock mode", async () => {
    process.env.MOCK_AI = "1";
    try {
      const res = await fetch(`${base}/api/route-intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req("delete the sign up button")),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ isCommand: true, targetId: "n2", action: "delete" });
    } finally {
      delete process.env.MOCK_AI;
    }
  });
});
