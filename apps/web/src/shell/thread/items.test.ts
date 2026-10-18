import { describe, expect, it } from "vitest";
import { deriveItems, groupTurns, lastPrompt } from "./items";
import type { LiftEntry } from "./runs";

const kinds = (items: { kind: string }[]) => items.map((i) => i.kind);
const base = { status: "idle" as const, error: null };

describe("deriveItems", () => {
  it("is empty for a fresh chat", () => {
    expect(deriveItems({ history: [], ...base })).toEqual([]);
  });
  it("pairs prompts with replies, result cards for edits, and an action row per turn", () => {
    const items = deriveItems({
      history: [
        { prompt: "a pricing page", summary: "Built it", kind: "page" },
        { prompt: "make it blue", summary: "Recolored", kind: "element", label: "Heading · Ember" },
      ],
      ...base,
    });
    expect(kinds(items)).toEqual(["user", "assistant", "actions", "user", "assistant", "result", "actions"]);
    expect(items[4]).toMatchObject({ element: true });
    expect(items[1]).toMatchObject({ element: false });
    expect(items[5]).toMatchObject({ kind: "result", result: { title: "Edited Heading · Ember" } });
  });
  it("skips the user bubble and the retry for prompt-less edits", () => {
    const items = deriveItems({ history: [{ prompt: "(edited)", summary: "Moved a card" }], ...base });
    expect(kinds(items)).toEqual(["assistant", "actions"]);
    expect(items[1]).toMatchObject({ retry: null });
  });
  it("adds a run line only for turns that were timed, with its steps", () => {
    const steps = [{ label: "Planning layout", at: 0 }];
    const items = deriveItems({
      history: [
        { prompt: "old", summary: "ok", kind: "page" },
        { prompt: "new", summary: "ok", kind: "page", ms: 12_000, steps, result: { title: "Built page", meta: "23 elements", rows: [] } },
      ],
      ...base,
    });
    expect(kinds(items)).toEqual(["user", "assistant", "actions", "user", "run", "assistant", "result", "actions"]);
    expect(items[4]).toMatchObject({ kind: "run", run: "build", ms: 12_000, steps });
    expect(items[6]).toMatchObject({ kind: "result", result: { meta: "23 elements" } });
  });
  it("labels answers and edits with their own run kind", () => {
    const items = deriveItems({
      history: [
        { prompt: "why?", summary: "Because", kind: "answer", ms: 2000 },
        { prompt: "bigger", summary: "Made it bigger.", kind: "element", label: "Heading", ms: 3000 },
      ],
      ...base,
    });
    expect(items.filter((i) => i.kind === "run").map((i) => (i as { run: string }).run)).toEqual(["ask", "edit"]);
  });
  it("only the newest page or element change is undoable, and only with something to undo", () => {
    const history = [
      { prompt: "a", summary: "x", kind: "page" as const, result: { title: "Built page", meta: "", rows: [] } },
      { prompt: "b", summary: "y", kind: "page" as const, result: { title: "Updated page", meta: "", rows: [] } },
    ];
    const withUndo = deriveItems({ history, ...base, canUndo: true }).filter((i) => i.kind === "result");
    expect(withUndo.map((i) => (i as { undoable: boolean }).undoable)).toEqual([false, true]);
    const without = deriveItems({ history, ...base }).filter((i) => i.kind === "result");
    expect(without.every((i) => !(i as { undoable: boolean }).undoable)).toBe(true);
  });
  it("keeps the action row of the newest turn only as latest", () => {
    const items = deriveItems({ history: [{ prompt: "a", summary: "x" }, { prompt: "b", summary: "y" }], ...base });
    expect(items.filter((i) => i.kind === "actions").map((i) => (i as { latest: boolean }).latest)).toEqual([false, true]);
  });
  it("retry re-runs a build or a question as what it was", () => {
    const items = deriveItems({ history: [{ prompt: "build", summary: "x", kind: "page" }, { prompt: "why", summary: "y", kind: "answer" }], ...base });
    const rows = items.filter((i) => i.kind === "actions");
    expect(rows[0]).toMatchObject({ retry: { prompt: "build", as: "build" } });
    expect(rows[1]).toMatchObject({ retry: { prompt: "why", as: "ask" } });
  });
  it("appends a live building row while loading or transcribing, carrying the run", () => {
    const run = { kind: "build" as const, startedAt: 1, steps: [{ label: "Planning layout", at: 0 }] };
    const l = deriveItems({ history: [], status: "loading", error: null, run });
    expect(l).toMatchObject([{ kind: "building", key: "building", label: "Building your page…", run }]);
    expect(deriveItems({ history: [], status: "transcribing", error: null })[0]).toMatchObject({ label: "Turning your voice into text…" });
  });
  it("appends an error with the retry prompt", () => {
    const items = deriveItems({ history: [{ prompt: "x", summary: "y" }], status: "error", error: "boom" });
    expect(items[items.length - 1]).toMatchObject({ kind: "error", message: "boom", retryPrompt: "x" });
    expect(deriveItems({ history: [], status: "error", error: null })[0]).toMatchObject({ message: "Something went wrong. Try again.", retryPrompt: null });
  });
  it("shows the attempted prompt as the user bubble, with a key the finished turn keeps", () => {
    const loading = deriveItems({ history: [], status: "loading", error: null, lastAttempt: "a pricing page" });
    expect(kinds(loading)).toEqual(["user", "building"]);
    const done = deriveItems({ history: [{ prompt: "a pricing page", summary: "ok", kind: "page" }], status: "idle", error: null });
    expect(loading[0].key).toBe(done[0].key);
    const failed = deriveItems({ history: [{ prompt: "old", summary: "ok" }], status: "error", error: "x", lastAttempt: "new one" });
    expect(kinds(failed)).toEqual(["user", "assistant", "actions", "user", "error"]);
    expect(failed[4]).toMatchObject({ retryPrompt: "new one" });
    const first = deriveItems({ history: [], status: "error", error: "x", lastAttempt: "first" });
    expect(first[1]).toMatchObject({ retryPrompt: "first" });
  });
  it("derives answer items with element label, switch-to-code and routed note", () => {
    const items = deriveItems({
      history: [
        { prompt: "what is 4.9?", summary: "A **rating**.", kind: "answer", label: "Text · 4.9", suggestCode: true, routed: true },
        { prompt: "plain", summary: "ok", kind: "answer" },
      ],
      ...base,
    });
    expect(kinds(items)).toEqual(["user", "answer", "actions", "user", "answer", "actions"]);
    expect(items[1]).toMatchObject({ label: "Text · 4.9", suggestCode: true, routed: true });
    expect(items[4]).toMatchObject({ label: null, suggestCode: false, routed: false });
  });
  it("shows Thinking while asking, and Retry never re-runs a question", () => {
    expect(deriveItems({ history: [], status: "idle", error: null, asking: true })).toMatchObject([{ kind: "building", label: "Thinking…" }]);
    expect(lastPrompt([{ prompt: "build", summary: "" }, { prompt: "why?", summary: "x", kind: "answer" }])).toBe("build");
  });
  it("lastPrompt ignores placeholders", () => {
    expect(lastPrompt([{ prompt: "a", summary: "" }, { prompt: "(edited)", summary: "" }])).toBe("a");
  });
  it("puts a staged change in the thread as a review card, preparing first", () => {
    const staging = deriveItems({ history: [{ prompt: "a", summary: "x" }], ...base, staging: true });
    expect(staging[staging.length - 1]).toMatchObject({ kind: "review", staging: true });
    const ready = deriveItems({ history: [{ prompt: "a", summary: "x" }], ...base, pending: { label: "Heading", summary: "Bigger" } });
    expect(ready[ready.length - 1]).toMatchObject({ kind: "review", staging: false, label: "Heading", summary: "Bigger" });
  });
  it("places lifted apps after the turns before them, with a Lifted run line and an app card", () => {
    const lift: LiftEntry = { id: "1", afterCount: 1, title: "Route 44 schedule", url: "http://x/y", rows: 12, columns: [{ label: "Stop", type: "text" }, { label: "Time", type: "time" }], sourceTitle: null, ms: 4000, steps: [] };
    const items = deriveItems({ history: [{ prompt: "a", summary: "x" }, { prompt: "b", summary: "y" }], ...base, lifts: [lift] });
    expect(kinds(items)).toEqual(["user", "assistant", "actions", "run", "result", "user", "assistant", "actions"]);
    expect(items[3]).toMatchObject({ run: "lift", ms: 4000 });
    expect(items[4]).toMatchObject({ action: "app", url: "http://x/y", undoable: false, result: { title: "Lifted Route 44 schedule", meta: "12 rows · 2 columns" } });
    const tail = deriveItems({ history: [], ...base, lifts: [lift] });
    expect(kinds(tail)).toEqual(["run", "result"]);
    expect(deriveItems({ history: [], ...base, lifting: true })[0]).toMatchObject({ kind: "building", label: "Lifting into an app…" });
  });
  it("groups items by turn", () => {
    const items = deriveItems({ history: [{ prompt: "a", summary: "x" }, { prompt: "b", summary: "y" }], ...base });
    const turns = groupTurns(items);
    expect(turns.map((t) => t.items.length)).toEqual([3, 3]);
    expect(new Set(turns.map((t) => t.turn)).size).toBe(2);
  });
});
