import { describe, expect, it, vi } from "vitest";
import { exitDestination, exitNarrate } from "./exit";

describe("exitDestination", () => {
  it("returns to the origin mode", () => {
    expect(exitDestination("page", "close")).toBe("text");
    expect(exitDestination("canvas", "close")).toBe("canvas");
    expect(exitDestination("canvas", "output")).toBe("canvas");
  });

  it("open page always shows the page", () => {
    expect(exitDestination("canvas", "page")).toBe("text");
    expect(exitDestination("page", "page")).toBe("text");
  });
});

describe("exitNarrate", () => {
  it.each([
    ["page", "close", "text"],
    ["canvas", "close", "canvas"],
    ["canvas", "output", "canvas"],
    ["canvas", "page", "text"],
  ] as const)("resets the canvas hand-off then sets the mode (%s, %s)", (origin, kind, mode) => {
    const calls: string[] = [];
    const reset = vi.fn(() => calls.push("reset"));
    const setMode = vi.fn((m: string) => calls.push(`mode:${m}`));
    expect(exitNarrate(origin, { reset, setMode }, kind)).toBe(mode);
    expect(calls).toEqual(["reset", `mode:${mode}`]);
  });
});
