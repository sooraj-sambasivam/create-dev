import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce, mostFailed, searchTerm } from "./search";

describe("searchTerm", () => {
  it("needs two non-space characters", () => {
    expect(searchTerm("a")).toBeNull();
    expect(searchTerm("  a ")).toBeNull();
    expect(searchTerm(" ab ")).toBe("ab");
  });
});

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once after 300ms with the last value", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d("co");
    vi.advanceTimersByTime(200);
    d("cof");
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("cof");
  });

  it("flush runs now and only once", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d("x1");
    d.flush();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d("x1");
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("mostFailed", () => {
  it("needs a sample and a majority", () => {
    expect(mostFailed(3, 3)).toBe(false);
    expect(mostFailed(2, 4)).toBe(false);
    expect(mostFailed(3, 4)).toBe(true);
  });
});
