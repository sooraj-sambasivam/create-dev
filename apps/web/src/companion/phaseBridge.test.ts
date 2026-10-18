import { describe, expect, it } from "vitest";
import { phaseToCompanion } from "./phaseBridge";

describe("phaseToCompanion", () => {
  it("maps every pointer phase to the right Pip event", () => {
    expect(phaseToCompanion({ kind: "idle" })).toBeNull();
    expect(phaseToCompanion({ kind: "listening", targetId: null, label: null })).toEqual({ type: "listening" });
    expect(phaseToCompanion({ kind: "understanding", targetId: "a", label: "Heading" })).toEqual({ type: "thinking", label: "Heading" });
    expect(phaseToCompanion({ kind: "editing", targetId: "a", label: null })).toEqual({ type: "thinking", label: undefined });
    expect(phaseToCompanion({ kind: "done", targetId: "a", label: "Heading", message: "Made it bigger" })).toEqual({
      type: "done", text: "Made it bigger", label: "Heading",
    });
    expect(phaseToCompanion({ kind: "failed", targetId: null, label: null, message: "Nope" })).toEqual({ type: "error", text: "Nope" });
    expect(phaseToCompanion({ kind: "ask", message: "Which one?" })).toEqual({ type: "confused", text: "Which one?" });
    expect(phaseToCompanion({ kind: "cancelled" })).toEqual({ type: "cancelled" });
    expect(phaseToCompanion({ kind: "answer", targetId: null, label: null, question: "q", answer: "It is a page." })).toEqual({
      type: "done", text: "It is a page.", label: undefined,
    });
  });
});
