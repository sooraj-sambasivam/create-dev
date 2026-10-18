import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockGenerate } from "@create/shared";
import { postJson } from "../lift/post";
import { geminiText, inklingText } from "./http";
import { listModels } from "./models";
import { answerAsk } from "../ask/ask";
import { extractEntity } from "../extract/extract";
import { generateRouter } from "../routes/generate";

const KEYS = ["TINKER_API_KEY", "TINKER_BASE_URL", "OPENROUTER_API_KEY", "GEMINI_API_KEY", "INKLING_MODEL", "GEMINI_MODEL", "MOCK_AI", "ANTHROPIC_API_KEY"];
beforeEach(() => KEYS.forEach((k) => delete process.env[k]));
afterEach(() => {
  KEYS.forEach((k) => delete process.env[k]);
  vi.restoreAllMocks();
});

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body)));
const askReq = { question: "what is this?", history: [] as { role: "user" | "assistant"; text: string }[] };

describe("model availability", () => {
  it("lists all four with availability from keys", () => {
    expect(listModels().map((m) => [m.id, m.available])).toEqual([["sonnet", false], ["haiku", false], ["inkling", false], ["gemini", false]]);
    process.env.OPENROUTER_API_KEY = "k";
    process.env.MOCK_AI = "1";
    const m = Object.fromEntries(listModels().map((x) => [x.id, x]));
    expect(m.inkling!.available).toBe(true);
    expect(m.sonnet!.available).toBe(true);
    expect(m.gemini!.available).toBe(false);
    expect(m.sonnet!.efforts).toEqual(["low", "medium", "high"]);
  });
});

describe("providers", () => {
  it("inkling posts to OpenRouter with the configured model and returns text", async () => {
    process.env.OPENROUTER_API_KEY = "sk-secret";
    process.env.INKLING_MODEL = "x/custom";
    const f = ok({ choices: [{ message: { content: "hello" } }] });
    expect(await inklingText({ user: "hi", effort: "high", fetchImpl: f as never })).toBe("hello");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(JSON.parse(init.body as string).model).toBe("x/custom");
    expect(JSON.parse(init.body as string).reasoning).toEqual({ effort: "high" });
  });
  it("inkling prefers Tinker over OpenRouter, with overridable base URL and model", async () => {
    process.env.TINKER_API_KEY = "tk-secret";
    process.env.OPENROUTER_API_KEY = "sk-secret";
    const f = ok({ choices: [{ message: { content: "ok" } }] });
    expect(await inklingText({ user: "hi", effort: "high", fetchImpl: f as never })).toBe("ok");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://tinker.thinkingmachines.dev/services/tinker-prod/oai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tk-secret");
    expect(JSON.parse(init.body as string).model).toBe("thinkingmachines/Inkling");
    process.env.TINKER_BASE_URL = "http://x.test/v1/";
    process.env.INKLING_MODEL = "m/custom";
    const g = ok({ choices: [{ message: { content: "ok" } }] });
    await inklingText({ user: "hi", fetchImpl: g as never });
    const [u2, i2] = g.mock.calls[0] as unknown as [string, RequestInit];
    expect(u2).toBe("http://x.test/v1/chat/completions");
    expect(JSON.parse(i2.body as string).model).toBe("m/custom");
  });
  it("tinker alone marks inkling available and failures return null without logging the key", async () => {
    process.env.TINKER_API_KEY = "tk-secret";
    expect(listModels().find((m) => m.id === "inkling")!.available).toBe(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(async () => new Response("no", { status: 401 }));
    expect(await inklingText({ user: "hi", fetchImpl: bad as never })).toBeNull();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("tk-secret");
  });
  it("returns null without a key or on HTTP errors, and never logs the key", async () => {
    expect(await inklingText({ user: "hi" })).toBeNull();
    process.env.GEMINI_API_KEY = "sk-secret";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await geminiText({ user: "hi", fetchImpl: bad as never })).toBeNull();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sk-secret");
  });
  it("gemini sends the key in a header, default model, JSON mime", async () => {
    process.env.GEMINI_API_KEY = "gk";
    const f = ok({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
    expect(await geminiText({ user: "hi", json: true, fetchImpl: f as never })).toBe("{}");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/models/gemini-3.8-flash:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("gk");
    expect(JSON.parse(init.body as string).generationConfig.responseMimeType).toBe("application/json");
  });
});

describe("ask", () => {
  it("answers with Inkling when selected and configured", async () => {
    process.env.OPENROUTER_API_KEY = "k";
    process.env.ANTHROPIC_API_KEY = "a";
    const f = ok({ choices: [{ message: { content: "inkling says hi" } }] });
    vi.stubGlobal("fetch", f);
    const r = await answerAsk({ ...askReq, model: "inkling" });
    vi.unstubAllGlobals();
    expect(r.answer).toBe("inkling says hi");
  });
  it("reports a fallback when the provider fails", async () => {
    process.env.GEMINI_API_KEY = "k";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const seen: string[] = [];
    const r = await answerAsk({ ...askReq, model: "gemini" }, { onFallback: (c) => seen.push(c) });
    vi.unstubAllGlobals();
    expect(seen).toEqual(["gemini"]);
    expect(r.provider).toBe("mock");
  });
  it("mock mode ignores the model", async () => {
    process.env.MOCK_AI = "1";
    expect((await answerAsk({ ...askReq, model: "inkling" })).provider).toBe("mock");
  });
});

describe("extract", () => {
  it("uses Gemini when configured", async () => {
    process.env.GEMINI_API_KEY = "k";
    const entity = { kind: "table", title: "T", columns: [{ key: "a", label: "A", type: "text" }], rows: [{ a: "1" }] };
    const f = ok({ candidates: [{ content: { parts: [{ text: JSON.stringify(entity) }] } }] });
    const r = await extractEntity("data:image/png;base64,AAAA", "x", { fetchImpl: f as never, jevFetch: vi.fn(async () => new Response("no", { status: 500 })) as never });
    expect(r.entity.rows).toEqual([{ a: "1" }]);
    expect(r.provider).toBe("gemini");
  });
});

describe("generate route", () => {
  it("mock mode stays deterministic regardless of model", async () => {
    process.env.MOCK_AI = "1";
    const app = express().use(express.json()).use("/api", generateRouter);
    const r = await postJson(app, "/api/generate", { prompt: "Coffee", model: "gemini", effort: "high" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual(mockGenerate("Coffee"));
  });
});
