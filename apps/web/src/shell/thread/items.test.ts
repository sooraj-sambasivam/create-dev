import { describe, expect, it } from "vitest";
import { deriveItems, lastPrompt } from "./items";

describe("deriveItems", () => {
  it("is empty for a fresh chat", () => {
    expect(deriveItems({ history: [], status: "idle", error: null })).toEqual([]);
  });
  it("pairs prompts with replies and flags element edits", () => {
    const items = deriveItems({
      history: [
        { prompt: "a pricing page", summary: "Built it", kind: "page" },
        { prompt: "make it blue", summary: "Recolored", kind: "element" },
      ],
      status: "idle",
      error: null,
    });
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(items[3]).toMatchObject({ element: true });
    expect(items[1]).toMatchObject({ element: false });
  });
  it("skips the user bubble for prompt-less edits", () => {
    const items = deriveItems({ history: [{ prompt: "(edited)", summary: "Moved a card" }], status: "idle", error: null });
    expect(items.map((i) => i.kind)).toEqual(["assistant"]);
  });
  it("appends a building row while loading or transcribing", () => {
    const l = deriveItems({ history: [], status: "loading", error: null });
    expect(l).toEqual([{ kind: "building", key: "building", label: "Building your page…" }]);
    expect(deriveItems({ history: [], status: "transcribing", error: null })[0]).toMatchObject({ label: "Transcribing…" });
  });
  it("appends an error with the retry prompt", () => {
    const items = deriveItems({ history: [{ prompt: "x", summary: "y" }], status: "error", error: "boom" });
    expect(items[items.length - 1]).toEqual({ kind: "error", key: "error", message: "boom", retryPrompt: "x" });
    expect(deriveItems({ history: [], status: "error", error: null })[0]).toMatchObject({ message: "Something went wrong.", retryPrompt: null });
  });
  it("shows the attempted prompt as the user bubble and retries exactly it", () => {
    const loading = deriveItems({ history: [], status: "loading", error: null, lastAttempt: "a pricing page" });
    expect(loading.map((i) => i.kind)).toEqual(["user", "building"]);
    const failed = deriveItems({ history: [{ prompt: "old", summary: "ok" }], status: "error", error: "x", lastAttempt: "new one" });
    expect(failed.map((i) => i.kind)).toEqual(["user", "assistant", "user", "error"]);
    expect(failed[3]).toMatchObject({ retryPrompt: "new one" });
    const first = deriveItems({ history: [], status: "error", error: "x", lastAttempt: "first" });
    expect(first[1]).toMatchObject({ retryPrompt: "first" });
  });
  it("derives answer items with element label, switch-to-code and routed note", () => {
    const items = deriveItems({
      history: [
        { prompt: "what is 4.9?", summary: "A **rating**.", kind: "answer", label: "Text · 4.9", suggestCode: true, routed: true },
        { prompt: "plain", summary: "ok", kind: "answer" },
      ],
      status: "idle",
      error: null,
    });
    expect(items.map((i) => i.kind)).toEqual(["user", "answer", "user", "answer"]);
    expect(items[1]).toMatchObject({ label: "Text · 4.9", suggestCode: true, routed: true });
    expect(items[3]).toMatchObject({ label: null, suggestCode: false, routed: false });
  });
  it("shows Thinking while asking, and Retry never re-runs a question", () => {
    expect(deriveItems({ history: [], status: "idle", error: null, asking: true })).toEqual([{ kind: "building", key: "building", label: "Thinking…" }]);
    expect(lastPrompt([{ prompt: "build", summary: "" }, { prompt: "why?", summary: "x", kind: "answer" }])).toBe("build");
  });
  it("lastPrompt ignores placeholders", () => {
    expect(lastPrompt([{ prompt: "a", summary: "" }, { prompt: "(edited)", summary: "" }])).toBe("a");
  });
});
