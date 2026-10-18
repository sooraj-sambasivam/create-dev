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

  it("answers a bare rating question with no pointer from the page", () => {
    expect(mockAnswer(ask("what does the 4.9 mean?", { screen }))).toBe(
      'The "4.9" next to the five stars is an average rating out of 5, shown with "from 1,200 makers" — so about 1,200 people rated it.',
    );
  });

  it("answers an edit request and suggests Code", async () => {
    const r = await answerAsk(ask("make this bigger", { screen, pointer: { targetId: "t1" } }));
    expect(r.suggestCode).toBe(true);
    expect(r.answer).toMatch(/Want me to change it\? Switch to Code\.$/);
    expect(r.answer).not.toContain("I can only explain");
    expect(r.answer).not.toMatch(/\bI (changed|made|updated)\b/);
  });

  it("falls back to the pointer label without a screen", () => {
    expect(mockAnswer(ask("what is this?", { pointer: { targetId: "x", label: "Pricing card" } }))).toContain("Pricing card");
  });
});

const page = (...children: object[]) =>
  ({ title: "Shop", theme: "light", children: [{ id: "c", type: "container", direction: "column", gap: "md", padding: "md", children }] }) as unknown as Screen;
const text = (id: string, t: string) => ({ id, type: "text", text: t });
const heading = (id: string, t: string) => ({ id, type: "heading", text: t, level: 2 });
const a = (q: string, s: Screen, pointer?: AskRequest["pointer"]) => mockAnswer(ask(q, { screen: s, ...(pointer ? { pointer } : {}) }));

describe("mock answer templates", () => {
  it("price", () => {
    const s = page(heading("h", "Pro plan"), text("p", "$29/mo"));
    const r = a("what is the $29?", s);
    expect(r).toContain('"$29/mo" is a price in US dollars');
    expect(r).toContain('"Pro plan"');
    expect(r).toContain("billed per month");
  });
  it("percentage and discount", () => {
    const r = a("what does 20% mean", page(heading("h", "Spring sale"), text("p", "20% off")));
    expect(r).toContain("20 out of every 100");
    expect(r).toContain("discount");
    expect(r).toContain('"Spring sale"');
  });
  it("count", () => {
    const r = a("how many is 1,200?", page(text("t", "1,200 makers"), heading("h", "Community")));
    expect(r).toContain('is a count of makers: about 1,200');
  });
  it("date", () => {
    const r = a("when is 2026-03-03", page(text("t", "Launch 2026-03-03"), heading("h", "Roadmap")));
    expect(r).toContain("is a date");
    expect(r).toContain("Tuesday");
  });
  it("rating node via pointer, with its label", () => {
    const s = page({ id: "r", type: "rating", value: 4.6, label: "1,240 reviews" });
    const r = a("what is this?", s, { targetId: "r" });
    expect(r).toContain('The "4.6" next to the five stars is an average rating out of 5');
    expect(r).toContain("about 1,240");
  });
  it("quoted word and key noun match", () => {
    const s = page(heading("h", "Welcome"), { id: "b", type: "button", label: "Get started", variant: "primary" });
    expect(a('what does "Get started" do', s)).toContain('That button reads "Get started"');
    expect(a("what is the welcome part?", s)).toContain('That heading reads "Welcome"');
  });
  it("plain element with parent context, and page summary when nothing matches", () => {
    const s = page(heading("h", "Welcome"), text("t", "We build things"));
    expect(a("what is this?", s, { targetId: "t" })).toContain('That text reads "We build things", next to "Welcome"');
    expect(a("explain zzz", s)).toContain('This page is "Shop"');
  });
  it("never claims an edit", () => {
    const r = a("make the 4.9 bigger", screen);
    expect(r).not.toMatch(/\b(changed|updated|made it)\b/i);
    expect(r.endsWith("Want me to change it? Switch to Code.")).toBe(true);
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

  it("sends the pointer image to Claude as a vision block", async () => {
    delete process.env.MOCK_AI;
    delete process.env.PERCEPTRON_API_KEY;
    const create = vi.fn(async (..._a: unknown[]) => ({ content: [{ type: "text", text: "A red chart." }] }));
    const client = { messages: { create } } as unknown as Anthropic;
    const r = await answerAsk(ask("what does this chart show?", { pointer: { targetId: "x", image: "data:image/png;base64,iVBORw0KGgo=" } }), { client });
    expect(r).toEqual({ answer: "A red chart.", provider: "claude" });
    const arg = create.mock.calls[0]![0] as { messages: { content: unknown }[] };
    expect(arg.messages.at(-1)!.content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
      { type: "text", text: "what does this chart show?" },
    ]);
  });

  it("mock mode mentions the image node alt", () => {
    const s = page({ id: "im", type: "image", src: "https://example.com/a.png", alt: "Sunset over the bay" });
    const r = mockAnswer(ask("what is in this photo?", { screen: s, pointer: { targetId: "im", image: "data:image/jpeg;base64,/9j/4AAQ" } }));
    expect(r).toContain("Sunset over the bay");
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
