import { describe, expect, it, vi } from "vitest";
import { DIAGRAM_NODES, ROUTES, diagramEdges, keyRows, nodesForRoute } from "./routes";
import { layoutDiagram } from "./diagramLayout";
import { absoluteUrl, sharePrototype } from "./shareApi";

describe("routes", () => {
  it("covers every required route with a unique method+path", () => {
    const keys = ROUTES.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of ["generate", "edit-node", "transcribe", "upload", "image", "image/resolve", "icons/search", "health", "generate-sketch", "demo", "route-intent", "voice-token", "prototypes"]) {
      expect(ROUTES.some((r) => r.path === `/api/${p}`)).toBe(true);
    }
    expect(ROUTES.some((r) => r.method === "GET" && r.path === "/api/prototypes/:id")).toBe(true);
  });
  it("only references declared diagram nodes", () => {
    const ids = new Set(DIAGRAM_NODES.map((n) => n.id));
    for (const [a, b] of diagramEdges()) {
      expect(ids.has(a)).toBe(true);
      expect(ids.has(b)).toBe(true);
    }
  });
  it("highlights client, api and providers for a route", () => {
    expect([...nodesForRoute("/api/transcribe")].sort()).toEqual(["api", "elevenlabs", "voice"]);
    expect(nodesForRoute("/nope").size).toBe(0);
  });
  it("lays out every edge", () => {
    expect(layoutDiagram().edges.length).toBe(diagramEdges().length);
  });
});

describe("keyRows", () => {
  it("hides Mongo unless reported", () => {
    expect(keyRows({ hasAnthropic: true, hasElevenLabs: false, mock: true }).map((r) => r.label)).toEqual(["Anthropic", "ElevenLabs", "Mock mode"]);
    const rows = keyRows({ hasMongo: true });
    expect(rows.find((r) => r.label === "MongoDB")?.ok).toBe(true);
  });
});

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
