import { describe, expect, it } from "vitest";
import { answerOffered, OFFER_TTL_MS } from "./pointerCommand";
import { phaseText } from "./PointerBubble";

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
});
