import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StoredSubmission } from "@create/shared";
import { createFormsRouter, formsToken } from "./route";
import { FileFormStore, MAX_SUBMISSIONS, isValidAppId } from "./store";

const SECRET = "test-secret";
const key = (id: string) => formsToken(id, SECRET);
let dir: string;
let server: Server;
let base: string;
let store: FileFormStore;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "forms-"));
  store = new FileFormStore(dir);
  const app = express();
  app.use("/api", createFormsRouter(store, { secret: SECRET }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/forms`;
});
afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const post = (id: string, body: unknown, raw?: string) =>
  fetch(`${base}/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body) });

describe("app id", () => {
  it("accepts url-safe ids and rejects traversal", () => {
    expect(isValidAppId("my-app_1")).toBe(true);
    for (const bad of ["", "../x", "a/b", "a.b", "x".repeat(41)]) expect(isValidAppId(bad)).toBe(false);
  });
});

describe("forms routes", () => {
  it("stores and lists newest first", async () => {
    await post("shop", { formId: "contact", fields: { email: "a@b.co" } });
    const res = await post("shop", { formId: "contact", fields: { email: "c@d.co" } });
    const saved = (await res.json()) as StoredSubmission;
    expect(saved).toMatchObject({ appId: "shop", formId: "contact" });
    expect(saved.id).toBeTruthy();
    const list = (await (await fetch(`${base}/shop?key=${key("shop")}`)).json()) as StoredSubmission[];
    expect(list.map((s) => s.fields.email)).toEqual(["c@d.co", "a@b.co"]);
  });

  it("returns an empty list for an unknown app", async () => {
    expect(await (await fetch(`${base}/nothing?key=${key("nothing")}`)).json()).toEqual([]);
  });

  it("requires the owner key to read submissions", async () => {
    expect((await fetch(`${base}/shop`)).status).toBe(401);
    expect((await fetch(`${base}/shop?key=wrong`)).status).toBe(401);
    expect((await fetch(`${base}/shop?key=${key("other")}`)).status).toBe(401);
    const bearer = await fetch(`${base}/shop`, { headers: { authorization: `Bearer ${key("shop")}` } });
    expect(bearer.status).toBe(200);
  });

  it("issues the token only to an allowed origin", async () => {
    const tok = (origin?: string) =>
      fetch(`${base}/shop/token`, { method: "POST", headers: origin ? { origin } : {} });
    expect((await tok()).status).toBe(401);
    expect((await tok("https://evil.example")).status).toBe(401);
    const ok = await tok("http://localhost:5173");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ token: key("shop") });
  });

  it("rejects a bad id, bad body and oversize body", async () => {
    expect((await post("bad.id", { formId: "f", fields: {} })).status).toBe(400);
    expect((await post("shop", { fields: {} })).status).toBe(400);
    expect((await post("shop", { formId: "f", fields: { a: "x".repeat(70_000) } })).status).toBe(413);
  });

  it("caps stored submissions", async () => {
    for (let i = 0; i < 3; i++) await store.add("cap", { formId: "f", fields: { n: String(i) } });
    expect((await store.list("cap")).length).toBeLessThanOrEqual(MAX_SUBMISSIONS);
  });
});
