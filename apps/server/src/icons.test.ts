import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIconSvgHandler, getIconSvg, ICON_CACHE_TTL_MS } from "./icons";

const realFetch = globalThis.fetch;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
const SVG_V2 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="2" height="2"/></svg>';

let cacheDir: string;
let upstream: ReturnType<typeof vi.fn>;

/** Serve Iconify requests from the mock; anything else (our own test server) goes to the real fetch. */
function mockIconify(handler: (url: string) => Promise<Response> | Response) {
  upstream = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://api.iconify.design/")) return handler(url);
    return realFetch(input);
  });
  vi.stubGlobal("fetch", upstream);
}

const ok = (body: string) => new Response(body, { status: 200, headers: { "Content-Type": "image/svg+xml" } });

beforeEach(async () => {
  // A fresh cache per test so entries from one test cannot leak into another.
  cacheDir = await mkdtemp(join(tmpdir(), "icons-test-"));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(cacheDir, { recursive: true, force: true });
});

describe("getIconSvg", () => {
  it("refuses malformed names without touching the network or disk", async () => {
    mockIconify(() => ok(SVG));
    for (const name of ["", "lucide", "lucide:", ":heart", "../etc:passwd", "lucide:heart.svg", "a/b:c", "lucide:heart:extra", "lucide:%2e%2e"]) {
      expect((await getIconSvg(name, cacheDir)).kind).toBe("missing");
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("fetches the icon from Iconify and returns the SVG", async () => {
    mockIconify(() => ok(SVG));
    expect(await getIconSvg("lucide:heart", cacheDir)).toEqual({ kind: "found", svg: SVG });
    expect(upstream).toHaveBeenCalledWith("https://api.iconify.design/lucide/heart.svg", expect.anything());
  });

  it("serves a fresh cache entry without a second fetch", async () => {
    mockIconify(() => ok(SVG));
    await getIconSvg("lucide:heart", cacheDir);
    const again = await getIconSvg("lucide:heart", cacheDir);
    expect(again).toEqual({ kind: "found", svg: SVG });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("shares one upstream request between concurrent lookups", async () => {
    mockIconify(() => ok(SVG));
    const [a, b] = await Promise.all([getIconSvg("lucide:star", cacheDir), getIconSvg("lucide:star", cacheDir)]);
    expect(a).toEqual(b);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("refetches a cache entry older than 24 h", async () => {
    mockIconify(() => ok(SVG));
    await getIconSvg("lucide:heart", cacheDir);
    const old = new Date(Date.now() - ICON_CACHE_TTL_MS - 60_000);
    await utimes(join(cacheDir, "lucide", "heart.svg"), old, old);

    mockIconify(() => ok(SVG_V2));
    expect(await getIconSvg("lucide:heart", cacheDir)).toEqual({ kind: "found", svg: SVG_V2 });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("treats a 200 body of \"404\" as not found and remembers it", async () => {
    mockIconify(() => ok("404"));
    expect((await getIconSvg("lucide:nope", cacheDir)).kind).toBe("missing");
    expect((await getIconSvg("lucide:nope", cacheDir)).kind).toBe("missing");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("treats an upstream 404 status as not found", async () => {
    mockIconify(() => new Response("not here", { status: 404 }));
    expect((await getIconSvg("lucide:nope", cacheDir)).kind).toBe("missing");
  });

  it("refetches a not-found entry older than 24 h", async () => {
    mockIconify(() => new Response("404", { status: 404 }));
    await getIconSvg("lucide:later", cacheDir);
    const old = new Date(Date.now() - ICON_CACHE_TTL_MS - 60_000);
    await utimes(join(cacheDir, "lucide", "later.404"), old, old);

    mockIconify(() => ok(SVG));
    expect(await getIconSvg("lucide:later", cacheDir)).toEqual({ kind: "found", svg: SVG });
  });

  it("returns unavailable when upstream fails and nothing is cached", async () => {
    mockIconify(() => {
      throw new TypeError("fetch failed");
    });
    expect((await getIconSvg("lucide:heart", cacheDir)).kind).toBe("unavailable");
  });

  it("returns unavailable on an upstream 5xx and does not cache the failure", async () => {
    mockIconify(() => new Response("oops", { status: 503 }));
    expect((await getIconSvg("lucide:heart", cacheDir)).kind).toBe("unavailable");

    mockIconify(() => ok(SVG));
    expect(await getIconSvg("lucide:heart", cacheDir)).toEqual({ kind: "found", svg: SVG });
  });

  it("falls back to a stale SVG when upstream fails", async () => {
    mockIconify(() => ok(SVG));
    await getIconSvg("lucide:heart", cacheDir);
    const old = new Date(Date.now() - ICON_CACHE_TTL_MS - 60_000);
    await utimes(join(cacheDir, "lucide", "heart.svg"), old, old);

    mockIconify(() => {
      throw new TypeError("fetch failed");
    });
    expect(await getIconSvg("lucide:heart", cacheDir)).toEqual({ kind: "found", svg: SVG });
  });

  it("treats a 200 body that is not SVG as a failure", async () => {
    mockIconify(() => ok("<html>maintenance</html>"));
    expect((await getIconSvg("lucide:heart", cacheDir)).kind).toBe("unavailable");
  });
});

describe("GET /api/icons/svg handler", () => {
  let server: Server;
  let base: string;

  // One server per test, bound to that test's cache dir, so cache entries never leak between tests.
  beforeEach(async () => {
    const app = express();
    app.get("/api/icons/svg", createIconSvgHandler(cacheDir));
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("responds with SVG and cache headers", async () => {
    mockIconify(() => ok(SVG));
    const res = await realFetch(`${base}/api/icons/svg?name=${encodeURIComponent("lucide:heart")}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\/svg\+xml/);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(await res.text()).toBe(SVG);
  });

  it("answers 404 for an invalid name without fetching", async () => {
    mockIconify(() => ok(SVG));
    const res = await realFetch(`${base}/api/icons/svg?name=${encodeURIComponent("../x:y")}`);
    expect(res.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("answers 404 when the name is missing from the query", async () => {
    const res = await realFetch(`${base}/api/icons/svg`);
    expect(res.status).toBe(404);
  });

  it("answers 404 with a JSON error for an unknown icon", async () => {
    mockIconify(() => ok("404"));
    const res = await realFetch(`${base}/api/icons/svg?name=${encodeURIComponent("lucide:nope")}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Unknown icon." });
  });

  it("answers 502 when Iconify is down and nothing is cached", async () => {
    mockIconify(() => {
      throw new TypeError("fetch failed");
    });
    const res = await realFetch(`${base}/api/icons/svg?name=${encodeURIComponent("lucide:heart")}`);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Icon service unavailable." });
  });
});
