import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { createApp } from "../app";
import { MemoryUserStore } from "./store";
import { hashPassword, signSession, verifyPassword, verifySession } from "./crypto";
import { MemoryCounter } from "../quota/counter";
import { dayWindow } from "../quota/limits";

describe("crypto", () => {
  it("hashes with a per-user salt and verifies", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
  });
  it("rejects tampered and expired tokens", () => {
    const t = signSession({ sub: "u1", kind: "account", exp: 2000 }, "s");
    expect(verifySession(t, 1000, "s")?.sub).toBe("u1");
    expect(verifySession(t, 3000, "s")).toBeNull();
    expect(verifySession(t, 1000, "other")).toBeNull();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin", kind: "account", exp: 2000 })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, 1000, "s")).toBeNull();
    expect(verifySession(`${body}.x`, 1000, "s")).toBeNull();
  });
  it("computes the UTC day window", () => {
    expect(dayWindow(Date.UTC(2026, 0, 31, 23, 0))).toEqual({ day: "2026-01-31", resetAt: "2026-02-01T00:00:00.000Z" });
  });
});

describe("auth + quota routes", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let base: string;
  let clock = Date.UTC(2026, 5, 1, 12);
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.MOCK_AI = "1";
    process.env.DEMO_ADMIN_EMAILS = "boss@example.com";
    delete process.env.AUTH_REQUIRED;
    delete process.env.DEMO_QUOTAS;
    server = createApp({
      userStore: new MemoryUserStore(),
      quota: { counter: new MemoryCounter(), now: () => clock, enabled: () => true },
    }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterEach(() => {
    server.close();
    process.env = { ...saved };
  });

  const post = (path: string, body: unknown, cookie?: string) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];

  it("signs up, sets an httpOnly Lax cookie, and /me returns the user", async () => {
    const res = await post("/auth/signup", { email: "A@Example.com", password: "password1", name: "Ann" });
    expect(res.status).toBe(201);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).toMatch(/Max-Age=2592000/);
    const me = await (await fetch(`${base}/auth/me`, { headers: { cookie: cookieOf(res) } })).json();
    expect(me.user).toMatchObject({ email: "a@example.com", kind: "account", name: "Ann" });
    expect(JSON.stringify(me)).not.toMatch(/passwordHash|scrypt/);
  });

  it("rejects duplicates, weak passwords, and wrong logins", async () => {
    await post("/auth/signup", { email: "a@example.com", password: "password1" });
    expect((await post("/auth/signup", { email: "a@example.com", password: "password1" })).status).toBe(409);
    expect((await post("/auth/signup", { email: "b@example.com", password: "short" })).status).toBe(400);
    expect((await post("/auth/login", { email: "a@example.com", password: "nope-nope" })).status).toBe(401);
    expect((await post("/auth/login", { email: "ghost@example.com", password: "password1" })).status).toBe(401);
    expect((await post("/auth/login", { email: "a@example.com", password: "password1" })).status).toBe(200);
  });

  it("guest sessions keep their identity; logout clears the cookie; /me is null when anonymous", async () => {
    const g = await post("/auth/guest", {});
    const c = cookieOf(g);
    const again = await post("/auth/guest", {}, c);
    expect((await g.json()).user.id).toBe((await again.json()).user.id);
    expect((await (await fetch(`${base}/auth/me`)).json()).user).toBeNull();
    const out = await post("/auth/logout", {}, c);
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });

  it("ignores a forged cookie", async () => {
    const me = await (await fetch(`${base}/auth/me`, { headers: { cookie: "create_session=abc.def" } })).json();
    expect(me.user).toBeNull();
  });

  it("limits a guest after 40 chat calls with a 429 body, and resets next day", async () => {
    const c = cookieOf(await post("/auth/guest", {}));
    // /ask with an invalid body still passes the gate; the route answers 400, the gate only counts.
    let status = 0;
    for (let i = 0; i < 40; i++) status = (await post("/ask", {}, c)).status;
    expect(status).not.toBe(429);
    const res = await post("/ask", {}, c);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Demo limit reached", bucket: "chat" });
    expect(Date.parse(body.resetAt)).toBeGreaterThan(clock);
    const usage = await (await fetch(`${base}/usage`, { headers: { cookie: c } })).json();
    expect(usage.buckets.chat.remaining).toBe(0);
    expect(usage.buckets.build.remaining).toBe(10);
    clock += 24 * 3600_000;
    expect((await post("/ask", {}, c)).status).not.toBe(429);
  });

  it("gives accounts 3x and admins no limit", async () => {
    const acct = cookieOf(await post("/auth/signup", { email: "u@example.com", password: "password1" }));
    const usage = await (await fetch(`${base}/usage`, { headers: { cookie: acct } })).json();
    expect(usage.buckets.build.limit).toBe(30);
    const admin = cookieOf(await post("/auth/signup", { email: "boss@example.com", password: "password1" }));
    const au = await (await fetch(`${base}/usage`, { headers: { cookie: admin } })).json();
    expect(au.admin).toBe(true);
    expect(au.enforced).toBe(false);
  });

  it("leaves anonymous callers alone by default, requires sign-in when AUTH_REQUIRED=1", async () => {
    expect((await post("/ask", {})).status).not.toBe(401);
    process.env.AUTH_REQUIRED = "1";
    const res = await post("/ask", {});
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "auth_required" });
    const c = cookieOf(await post("/auth/guest", {}));
    expect((await post("/ask", {}, c)).status).not.toBe(401);
  });

  it("counts /locate only in commit mode", async () => {
    const c = cookieOf(await post("/auth/guest", {}));
    await post("/locate", { mode: "preview" }, c);
    await post("/locate", { mode: "commit" }, c);
    const usage = await (await fetch(`${base}/usage`, { headers: { cookie: c } })).json();
    expect(usage.buckets.lift.used).toBe(1);
  });
});
