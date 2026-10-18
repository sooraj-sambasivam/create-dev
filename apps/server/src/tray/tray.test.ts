import { describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { createTrayRouter } from "./route";
import { createTrayStore } from "./store";
import { isAllowedOrigin } from "../middleware/origins";

async function call(app: express.Express, method: string, path: string, body?: unknown) {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
  } finally {
    server.close();
  }
}
const item = { title: "Bus loads", kind: "table", url: "http://localhost:5175/?p=abc" };

describe("tray", () => {
  it("queues oldest-first and caps at 50", () => {
    const s = createTrayStore();
    for (let i = 0; i < 55; i++) s.push({ ...item, title: `t${i}` });
    const l = s.list();
    expect(l).toHaveLength(50);
    expect(l[0]!.title).toBe("t5");
    expect(l[49]!.title).toBe("t54");
  });
  it("GET/POST/DELETE round trip with validation", async () => {
    const app = express().use("/api", createTrayRouter(createTrayStore()));
    expect((await call(app, "GET", "/api/tray")).body).toEqual({ items: [] });
    expect((await call(app, "POST", "/api/tray", { title: "" })).status).toBe(400);
    expect((await call(app, "POST", "/api/tray", { ...item, url: "javascript:alert(1)" })).status).toBe(400);
    const made = await call(app, "POST", "/api/tray", item);
    expect(made.status).toBe(201);
    const list = (await call(app, "GET", "/api/tray")).body.items;
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(["createdAt", "id", "kind", "title", "url"]);
    expect((await call(app, "DELETE", `/api/tray/${list[0].id}`)).status).toBe(200);
    expect((await call(app, "DELETE", `/api/tray/${list[0].id}`)).status).toBe(404);
  });
  it("refuses bodies over 256kb and titles over 200 chars", async () => {
    const app = express().use("/api", createTrayRouter(createTrayStore()));
    expect((await call(app, "POST", "/api/tray", { ...item, title: "x".repeat(9000) })).status).toBe(400);
    const r = await call(app, "POST", "/api/tray", { ...item, snippetHtml: "<p>" + "x".repeat(300_000) });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
  it("rate limits writes", async () => {
    const app = express().use("/api", createTrayRouter(createTrayStore()));
    let last = 0;
    for (let i = 0; i < 62; i++) last = (await call(app, "POST", "/api/tray", item)).status;
    expect(last).toBe(429);
  });
  it("allows extension origins on /api/tray only with import-element", () => {
    expect(isAllowedOrigin("chrome-extension://abc", "/api/tray")).toBe(true);
    expect(isAllowedOrigin("chrome-extension://abc", "/api/tray/x")).toBe(true);
    expect(isAllowedOrigin("chrome-extension://abc", "/api/lift")).toBe(false);
  });
});

const thumb = "data:image/jpeg;base64," + Buffer.from("fake-jpeg-bytes").toString("base64");
const snip = { title: "Pricing card", kind: "snippet", thumbnail: thumb, snippetHtml: '<div class="card"><h3>Pro</h3><p>$9</p></div>', styles: { color: "rgb(0, 0, 0)" }, source: { app: "narrate", url: "http://localhost:5175/" } };

describe("tray snippets", () => {
  it("stores snippets, lists them light and serves thumbnail + snippet separately", async () => {
    const app = express().use("/api", createTrayRouter(createTrayStore()));
    const made = await call(app, "POST", "/api/tray", snip);
    expect(made.status).toBe(201);
    const [it] = (await call(app, "GET", "/api/tray")).body.items;
    expect(it.hasSnippet).toBe(true);
    expect(it.thumbnailUrl).toBe(`/api/tray/${it.id}/thumbnail`);
    expect(it.thumbnail).toBeUndefined();
    expect(it.snippetHtml).toBeUndefined();
    const t = await fetch(`http://127.0.0.1:${(app.listen(0).address() as AddressInfo).port}/api/tray/${it.id}/thumbnail`);
    expect(t.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await t.arrayBuffer()).toString()).toBe("fake-jpeg-bytes");
    const s = await call(app, "GET", `/api/tray/${it.id}/snippet`);
    expect(s.body.html).toContain("<h3>Pro</h3>");
  });
  it("rejects non-JPEG thumbnails, oversized thumbnails and too many style keys", async () => {
    const app = express().use("/api", createTrayRouter(createTrayStore()));
    expect((await call(app, "POST", "/api/tray", { ...snip, thumbnail: "data:image/svg+xml;base64,AAAA" })).status).toBe(400);
    expect((await call(app, "POST", "/api/tray", { ...snip, thumbnail: "data:image/jpeg;base64," + "A".repeat(90_001) })).status).toBe(400);
    const styles = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`k${String.fromCharCode(97 + i)}`, "1"]));
    expect((await call(app, "POST", "/api/tray", { ...snip, styles })).status).toBe(400);
  });
  it("sanitizes snippet html on the way in", async () => {
    const store = createTrayStore();
    const app = express().use("/api", createTrayRouter(store));
    await call(app, "POST", "/api/tray", { ...snip, snippetHtml: '<div onclick="x()"><script>alert(1)</script><a href="javascript:alert(1)">hi</a></div>' });
    const html = store.list()[0] && store.get(store.list()[0]!.id)!.snippetHtml!;
    expect(html).not.toMatch(/script|onclick|javascript/i);
    expect(html).toContain("hi");
  });
  it("keeps only the newest 50 with snippets", () => {
    const s = createTrayStore();
    for (let i = 0; i < 52; i++) s.push({ title: `t${i}`, kind: "snippet", snippetHtml: "<p>x</p>" });
    expect(s.list()).toHaveLength(50);
    expect(s.list()[0]!.title).toBe("t2");
  });
  it("opens a snippet as a saved page and a lifted item by its url", async () => {
    const saved: unknown[] = [];
    const protos = { save: async (p: unknown) => { saved.push(p); return { id: "abcDEF1234" }; }, get: async () => null } as never;
    const app = express().use("/api", createTrayRouter(createTrayStore(), () => protos));
    const a = (await call(app, "POST", "/api/tray", snip)).body.item;
    const opened = await call(app, "POST", `/api/tray/${a.id}/open`);
    expect(opened.status).toBe(200);
    expect(opened.body.url).toMatch(/\/\?p=abcDEF1234$/);
    expect(saved).toHaveLength(1);
    const b = (await call(app, "POST", "/api/tray", item)).body.item;
    expect((await call(app, "POST", `/api/tray/${b.id}/open`)).body.url).toBe(item.url);
    expect((await call(app, "POST", "/api/tray/nope/open")).status).toBe(404);
  });
});
