import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ScreenSchema, type SketchRequest } from "@create/shared";
import { GenerationError } from "../ai/claude";
import { sketchRouter } from "../routes/sketch";
import { createAnthropicProvider } from "./anthropic";
import { createGrokProvider } from "./grok";
import { createOpenAIProvider } from "./openai";
import { createPerceptronProvider } from "./perceptron";
import type { VisionProvider } from "./types";

const KEYS = [
  "MOCK_AI",
  "VISION_PROVIDER",
  "PERCEPTRON_API_KEY",
  "PERCEPTRON_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "CLAUDE_MODEL",
  "XAI_API_KEY",
  "XAI_MODEL",
  "GROK_API_KEY",
  "GROK_MODEL",
] as const;

const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const sketch: SketchRequest = {
  image: "iVBORw0KGgo=",
  shapes: [{ id: "t", type: "text", x: 0, y: 0, w: 120, h: 40, text: "Welcome" }],
};

const good = JSON.stringify({
  summary: "Built a welcome page from the sketch.",
  screen: {
    title: "Welcome",
    accent: "#4f46e5",
    children: [{ id: "hero-title", type: "heading", text: "Welcome", level: 1 }],
  },
});

type Call = { url: string; init: RequestInit };

function installFetch(texts: string[], status = 200): Call[] {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const target = String(url);
      if (target.startsWith("http://127.0.0.1") || target.startsWith("http://localhost")) return original(url, init);
      calls.push({ url: target, init });
      const text = texts[Math.min(calls.length - 1, texts.length - 1)];
      const body = target.includes("anthropic.com")
        ? { content: [{ type: "text", text }] }
        : { choices: [{ message: { content: text } }] };
      return new Response(JSON.stringify(status === 200 ? body : { error: "nope" }), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

const providers: {
  id: string;
  create: () => VisionProvider;
  env: Record<string, string>;
  url: string;
  model: string;
  detail?: "high";
}[] = [
  {
    id: "perceptron",
    create: createPerceptronProvider,
    env: { PERCEPTRON_API_KEY: "pk-test", PERCEPTRON_MODEL: "perceptron-test" },
    url: "https://api.perceptron.inc/v1/chat/completions",
    model: "perceptron-test",
  },
  {
    id: "openai",
    create: createOpenAIProvider,
    env: { OPENAI_API_KEY: "sk-test" },
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o",
  },
  {
    id: "grok",
    create: createGrokProvider,
    env: { XAI_API_KEY: "xai-test", GROK_MODEL: "grok-test" },
    url: "https://api.x.ai/v1/chat/completions",
    model: "grok-test",
    detail: "high",
  },
  {
    id: "anthropic",
    create: createAnthropicProvider,
    env: { ANTHROPIC_API_KEY: "ak-test", ANTHROPIC_MODEL: "claude-test" },
    url: "https://api.anthropic.com/v1/messages",
    model: "claude-test",
  },
];

describe.each(providers)("$id vision provider", (spec) => {
  function applyEnv() {
    for (const key of KEYS) delete process.env[key];
    Object.assign(process.env, spec.env);
    process.env.VISION_PROVIDER = spec.id;
  }

  it("parses a screen from mocked HTTP and does not call a real API twice", async () => {
    applyEnv();
    const calls = installFetch([good]);
    const out = await spec.create().generate(sketch);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(spec.url);
    expect(ScreenSchema.parse(out.screen).title).toBe("Welcome");
    const body = bodyOf(calls[0]);
    expect(body.model).toBe(spec.model);
    const serialized = JSON.stringify(body);
    expect(serialized).toContain("iVBORw0KGgo=");
    expect(serialized).toContain("Never return HTML, innerHTML");
    expect(serialized).not.toContain("page_operations");
    if (spec.id === "anthropic") {
      const headers = calls[0].init.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("ak-test");
      expect(headers.authorization).toBeUndefined();
      expect(serialized).not.toContain("response_format");
    } else {
      const headers = calls[0].init.headers as Record<string, string>;
      expect(headers.authorization).toBe(`Bearer ${spec.env[spec.id === "grok" ? "XAI_API_KEY" : spec.id === "openai" ? "OPENAI_API_KEY" : "PERCEPTRON_API_KEY"]}`);
      expect(body.response_format).toEqual({ type: "json_object" });
      if (spec.detail) expect(serialized).toContain('"detail":"high"');
    }
  });

  it("repairs once when the first payload is not a screen", async () => {
    applyEnv();
    const calls = installFetch(["<div>not a screen</div>", good]);
    const out = await spec.create().generate(sketch);
    expect(calls).toHaveLength(2);
    expect(out.summary).toContain("welcome page");
    const second = JSON.stringify(bodyOf(calls[1]));
    expect(second).toContain("ScreenSchema");
    expect(second).toContain("iVBORw0KGgo=");
  });

  it("stops after the repair round", async () => {
    applyEnv();
    const calls = installFetch(["not json", "still not json", good]);
    await expect(spec.create().generate(sketch)).rejects.toMatchObject({ status: 422 });
    expect(calls).toHaveLength(2);
  });

  it("does not call HTTP when the key is missing", async () => {
    for (const key of KEYS) delete process.env[key];
    const calls = installFetch([good]);
    await expect(spec.create().generate(sketch)).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(0);
  });
});

describe("provider HTTP errors", () => {
  it("maps a rejected key to 502 without a repair call", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const calls = installFetch(["{}"], 401);
    await expect(createOpenAIProvider().generate(sketch)).rejects.toMatchObject({ status: 502 });
    expect(calls).toHaveLength(1);
  });

  it("accepts GROK_API_KEY when XAI_API_KEY is unset", async () => {
    delete process.env.XAI_API_KEY;
    process.env.GROK_API_KEY = "grok-alias";
    const calls = installFetch([good]);
    await createGrokProvider().generate(sketch);
    expect(calls[0].url).toBe("https://api.x.ai/v1/chat/completions");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer grok-alias");
  });

  it("rejects an oversize or unsupported image before HTTP", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const calls = installFetch([good]);
    await expect(createOpenAIProvider().generate({ image: `data:image/png;base64,${"A".repeat(4 * 1747627)}`, shapes: [] })).rejects.toMatchObject({
      status: 413,
    });
    await expect(createOpenAIProvider().generate({ image: "data:image/svg+xml;base64,PHN2Zy8+", shapes: [] })).rejects.toBeInstanceOf(GenerationError);
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/generate-sketch provider wiring", () => {
  it("uses the selected provider when mock mode is off", async () => {
    delete process.env.MOCK_AI;
    process.env.VISION_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-live-test";
    const calls = installFetch([good]);
    const app = express();
    app.use("/api", sketchRouter);
    const server: Server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    try {
      const port = (server.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/generate-sketch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sketch),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(ScreenSchema.parse(json.screen).title).toBe("Welcome");
      expect(calls.some((call) => call.url === "https://api.openai.com/v1/chat/completions")).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
