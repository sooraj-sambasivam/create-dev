import { afterEach, describe, expect, it, vi } from "vitest";
import { answerOffered, OFFER_TTL_MS, runPointerCommand, type CommandCtx } from "./pointerCommand";
import { phaseAnnouncement, phaseText, SLOW_MS, type PointerPhase } from "./PointerBubble";

const offered = {
  t: 1000,
  text: "make this bigger",
  candidates: [
    { id: "h1", label: "heading: Welcome", kind: "node" as const },
    { id: "b1", label: "button: Buy now", kind: "node" as const },
  ],
};

describe("answerOffered", () => {
  it("re-targets the original line at the named candidate", () => {
    expect(answerOffered(offered, "the button", 2000)).toEqual({
      transcript: "make this bigger",
      candidates: [offered.candidates[1]],
      pointer: { targetId: "b1", label: "button: Buy now" },
    });
  });
  it("ignores stale, unrelated and long replies", () => {
    expect(answerOffered(offered, "the button", 1000 + OFFER_TTL_MS + 1)).toBeNull();
    expect(answerOffered(offered, "make it red", 2000)).toBeNull();
    expect(answerOffered(offered, "change the button to a much larger size please", 2000)).toBeNull();
    expect(answerOffered(null, "the button", 2000)).toBeNull();
  });
});

describe("phaseText", () => {
  it("leaves the answer text to the card", () => {
    expect(phaseText({ kind: "answer", targetId: null, label: null, question: "q", answer: "a" })).toBe("");
  });

  it("says Cancelled", () => {
    expect(phaseText({ kind: "cancelled" })).toBe("Cancelled");
  });
  it("says Still working after the slow threshold, only while working", () => {
    expect(SLOW_MS).toBe(1000);
    expect(phaseText({ kind: "understanding", targetId: null, label: null }, true)).toBe("Still working…");
    expect(phaseText({ kind: "editing", targetId: "a", label: "A" }, true)).toBe("Still working…");
    expect(phaseText({ kind: "editing", targetId: "a", label: "A" })).toBe("Editing…");
    expect(phaseText({ kind: "done", targetId: "a", label: "A" }, true)).toBe("Done");
  });
});

describe("phaseAnnouncement", () => {
  it("mirrors the status with the target label, and the answer text in full", () => {
    expect(phaseAnnouncement({ kind: "idle" }, null)).toBe("");
    expect(phaseAnnouncement({ kind: "listening", targetId: "h1", label: "Welcome" }, "Heading · Welcome")).toBe("Heading · Welcome. Listening");
    expect(phaseAnnouncement({ kind: "listening", targetId: null, label: null }, null)).toBe("Listening");
    expect(phaseAnnouncement({ kind: "done", targetId: "h1", label: "Welcome", message: "Made it bigger" }, "Heading")).toBe("Heading. Done · Made it bigger");
    expect(phaseAnnouncement({ kind: "cancelled" }, null)).toBe("Cancelled");
    expect(phaseAnnouncement({ kind: "answer", targetId: null, label: null, question: "q", answer: "It is a hero." }, null)).toBe("It is a hero.");
  });
});

describe("runPointerCommand cancel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("aborts the intent fetch and sets no phase after cancel", async () => {
    const phases: PointerPhase[] = [];
    const ctl = new AbortController();
    let sawSignal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      sawSignal = init.signal;
      return new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    });
    const ctx: CommandCtx = {
      mode: () => "code",
      setPhase: (p) => { if (!ctl.signal.aborted) phases.push(p); },
      isDone: () => ctl.signal.aborted,
      signal: ctl.signal,
      offer: () => {},
    };
    const req = { transcript: "make this red", candidates: [{ id: "h1", label: "heading: Welcome", kind: "node" as const }], pointer: { targetId: "h1", label: "heading: Welcome" } };
    runPointerCommand(ctx, "make this red", req, { h1: 1 });
    expect(phases.map((p) => p.kind)).toEqual(["understanding"]);
    ctl.abort();
    await new Promise((r) => setTimeout(r, 0));
    expect(sawSignal).toBe(ctl.signal);
    expect(phases.map((p) => p.kind)).toEqual(["understanding"]);
  });
});
