import { describe, expect, it, vi } from "vitest";
import { emitCompanion, getCompanionLevel, parseCompanionEvent, subscribeCompanion } from "./bus";

describe("parseCompanionEvent", () => {
  it("accepts known types and drops unknown ones", () => {
    expect(parseCompanionEvent({ type: "done", text: "ok" })).toEqual({ type: "done", text: "ok" });
    expect(parseCompanionEvent({ type: "dance" })).toBeNull();
    expect(parseCompanionEvent(null)).toBeNull();
    expect(parseCompanionEvent("done")).toBeNull();
  });
  it("truncates strings to 120 chars and strips control characters", () => {
    const e = parseCompanionEvent({ type: "note", text: "a".repeat(300), label: "x\u0000y" });
    expect(e?.text?.length).toBe(120);
    expect(e?.label).toBe("x y");
  });
  it("clamps level and ignores non-numbers", () => {
    expect(parseCompanionEvent({ type: "level", level: 4 })?.level).toBe(1);
    expect(parseCompanionEvent({ type: "level", level: -1 })?.level).toBe(0);
    expect(parseCompanionEvent({ type: "level", level: "x" })?.level).toBeUndefined();
  });
});

describe("emit/subscribe", () => {
  it("is a no-op without a window", () => {
    expect(() => emitCompanion({ type: "done" })).not.toThrow();
    expect(subscribeCompanion(() => {})()).toBeUndefined();
  });
  it("delivers validated events and tracks level", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    vi.stubGlobal("CustomEvent", class extends Event { detail: unknown; constructor(t: string, i?: { detail?: unknown }) { super(t); this.detail = i?.detail; } });
    const got: string[] = [];
    const off = subscribeCompanion((e) => got.push(e.type));
    emitCompanion({ type: "thinking" });
    target.dispatchEvent(Object.assign(new Event("create:companion"), { detail: { type: "bogus" } }));
    emitCompanion({ type: "level", level: 0.5 });
    expect(got).toEqual(["thinking", "level"]);
    expect(getCompanionLevel().level).toBe(0.5);
    off();
    emitCompanion({ type: "done" });
    expect(got).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});
