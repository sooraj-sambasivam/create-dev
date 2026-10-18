import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskRequestSchema, type AskRequest, type Screen } from "@create/shared";
import { answerAsk, buildSystemPrompt, mockAnswer, wantsEdit } from "./ask";
import { routeIntentFallback } from "../intent/intent";

const screen = {
  title: "Maker Shop",
  theme: "light",
  children: [
    {
      id: "box",
      type: "container",
      direction: "row",
      gap: "md",
      padding: "md",
      children: [
        { id: "r1", type: "rating", value: 4.9, label: null },
        { id: "t1", type: "text", text: "from 1,200 makers" },
      ],
    },
  ],
} as unknown as Screen;

const ask = (question: string, extra: Partial<AskRequest> = {}): AskRequest =>
  AskRequestSchema.parse({ question, ...extra });

beforeEach(() => {
  process.env.MOCK_AI = "1";
});
afterEach(() => {
  delete process.env.MOCK_AI;
  vi.restoreAllMocks();
});

describe("wantsEdit", () => {
  it("flags change requests but not questions", () => {
    expect(wantsEdit("make this bigger")).toBe(true);
    expect(wantsEdit("can you change the color?")).toBe(true);
    expect(wantsEdit("what does this 4.9 mean?")).toBe(false);
    expect(wantsEdit("how do I make this bigger")).toBe(false);
  });
});

describe("mock answer", () => {
  it("explains the pointed rating using nearby text", async () => {
    const r = await answerAsk(ask("what does this 4.9 mean?", { screen, pointer: { targetId: "r1" } }));
    expect(r.provider).toBe("mock");
    expect(r.answer).toContain('"4.9"');
    expect(r.answer).toContain("from 1,200 makers");
    expect(r.suggestCode).toBeUndefined();
  });

  it("answers an edit request and suggests Code", async () => {
    const r = await answerAsk(ask("make this bigger", { screen, pointer: { targetId: "t1" } }));
    expect(r.suggestCode).toBe(true);
    expect(r.answer).toContain("Switch to Code");
    expect(r.answer).not.toMatch(/\bI (changed|made|updated)\b/);
  });

  it("falls back to the pointer label without a screen", () => {
    expect(mockAnswer(ask("what is this?", { pointer: { targetId: "x", label: "Pricing card" } }))).toContain("Pricing card");
  });
});

describe("real mode", () => {
  it("sends the outline and pointed JSON, and falls back on error", async () => {
    delete process.env.MOCK_AI;
    const create = vi.fn(async (..._a: unknown[]) => ({ content: [{ type: "text", text: "It is the average rating." }] }));
    const client = { messages: { create } } as unknown as Anthropic;
    const req = ask("what is this?", { screen, pointer: { targetId: "r1" } });
    const r = await answerAsk(req, { client });
    expect(r).toEqual({ answer: "It is the average rating.", provider: "claude" });
    const arg = create.mock.calls[0]![0] as { model: string; system: string };
    expect(arg.model).not.toMatch(/opus/);
    expect(arg.system).toContain("r1 [rating]");
    expect(arg.system).toContain('"value":4.9');

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = { messages: { create: vi.fn(async () => { throw new Error("boom"); }) } } as unknown as Anthropic;
    expect((await answerAsk(req, { client: bad })).provider).toBe("mock");
  });

  it("system prompt forbids claiming edits", () => {
    expect(buildSystemPrompt(ask("hi"))).toMatch(/can NOT edit/);
  });
});

describe("intent: ask wins over restyle", () => {
  it.each(["what does this color mean", "why is this so big?", "explain this heading", "is this blue?", "make it bigger?"])(
    "%s is ask",
    (t) => {
      expect(routeIntentFallback({ transcript: t, candidates: [] }).action).toBe("ask");
    },
  );
  it("keeps commands and polite requests as edits", () => {
    expect(routeIntentFallback({ transcript: "make this bigger", candidates: [] }).action).toBe("resize");
    expect(routeIntentFallback({ transcript: "can you make this blue?", candidates: [] }).action).toBe("restyle");
  });
});
