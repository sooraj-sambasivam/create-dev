import { describe, expect, it, vi } from "vitest";
import { absoluteUrl, sharePrototype } from "./shareApi";

describe("shareApi", () => {
  it("absolutizes relative urls", () => {
    expect(absoluteUrl("/?p=abc", "http://x")).toBe("http://x/?p=abc");
    expect(absoluteUrl("https://y/z", "http://x")).toBe("https://y/z");
  });
  it("posts and returns the url, and surfaces server errors", async () => {
    const screen = { title: "T" } as never;
    vi.stubGlobal("location", { origin: "http://h" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: "a", url: "/?p=a" }) }));
    expect(await sharePrototype(screen)).toEqual({ id: "a", url: "http://h/?p=a" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "bad" }) }));
    await expect(sharePrototype(screen)).rejects.toThrow("bad");
  });
});

describe("syncFrameHead", () => {
  it("is exported", async () => {
    const m = await import("./PreviewFrame");
    expect(typeof m.syncFrameHead).toBe("function");
  });
});
