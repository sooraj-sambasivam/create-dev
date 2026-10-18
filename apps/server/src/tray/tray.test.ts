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
  it("refuses bodies over 8kb", async () => {
    const app = express().use("/api", createTrayRouter(createTrayStore()));
    const r = await call(app, "POST", "/api/tray", { ...item, title: "x".repeat(9000) });
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
