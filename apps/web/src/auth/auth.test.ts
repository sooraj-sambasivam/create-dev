import { afterEach, describe, expect, it, vi } from "vitest";
import { displayName, limitMessage, needsSignIn, parseMe, parseUsage } from "./model";
import { handleAuthFailure } from "./limits";
import { useAuth } from "./authStore";
import { useToasts } from "../ui/toastStore";

afterEach(() => {
  vi.unstubAllGlobals();
  useToasts.setState({ toasts: [] });
  useAuth.setState({ status: "loading", user: null, usage: null, showSignIn: false });
});

describe("auth model", () => {
  it("parses /me defensively", () => {
    expect(parseMe(null)).toEqual({ user: null, authRequired: false, showSignIn: false });
    expect(parseMe({ user: { id: "a", kind: "account", email: "e@x.co", admin: true }, showSignIn: true }).user).toMatchObject({ email: "e@x.co", admin: true });
    expect(parseMe({ user: { id: "a", kind: "root" } }).user).toBeNull();
  });
  it("shows the sign-in screen only once ready, signed out and asked by the server", () => {
    expect(needsSignIn("loading", null, true)).toBe(false);
    expect(needsSignIn("ready", null, true)).toBe(true);
    expect(needsSignIn("ready", null, false)).toBe(false);
    expect(needsSignIn("ready", { id: "g", kind: "guest", admin: false }, true)).toBe(false);
  });
  it("parses usage and clamps remaining", () => {
    const u = parseUsage({
      kind: "guest", admin: false, enforced: true, resetAt: "2026-01-01T00:00:00.000Z",
      buckets: { build: { limit: 10, used: 12 }, lift: { limit: 20, used: 1 }, chat: { limit: 40, used: 0 } },
    });
    expect(u?.buckets.build.remaining).toBe(0);
    expect(u?.buckets.lift.remaining).toBe(19);
    expect(parseUsage({ buckets: {} })).toBeNull();
  });
  it("words the limit message and names users", () => {
    expect(limitMessage("build", undefined)).toBe("Daily demo limit reached for builds.");
    expect(limitMessage("chat", "2026-01-01T00:00:00.000Z", "en-US")).toMatch(/^Daily demo limit reached for chat messages\. It resets at /);
    expect(displayName({ id: "g", kind: "guest", admin: false })).toBe("Guest");
    expect(displayName({ id: "a", kind: "account", email: "e@x.co", admin: false })).toBe("e@x.co");
  });
});

describe("limit handling", () => {
  it("toasts a friendly message on a 429 demo limit and ignores other errors", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const msg = handleAuthFailure(429, { error: "Demo limit reached", bucket: "build" });
    expect(msg).toMatch(/limit reached for builds/);
    expect(useToasts.getState().toasts).toHaveLength(1);
    expect(handleAuthFailure(429, { error: "Too many requests." })).toBeUndefined();
    expect(handleAuthFailure(500, {})).toBeUndefined();
  });
  it("drops the session on auth_required", () => {
    useAuth.setState({ user: { id: "g", kind: "guest", admin: false } });
    expect(handleAuthFailure(401, { code: "auth_required" })).toBe("Sign in to continue.");
    expect(useAuth.getState().user).toBeNull();
  });
});

describe("auth store", () => {
  it("load -> guest sets the user and loads usage with credentials", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      const json = (b: unknown, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => b });
      if (url === "/api/auth/me") return json({ user: null, authRequired: false, showSignIn: true });
      if (url === "/api/auth/guest") return json({ user: { id: "guest_1", kind: "guest", admin: false } });
      return json({ kind: "guest", admin: false, enforced: true, resetAt: "2026-01-01T00:00:00.000Z", buckets: { build: { limit: 10, used: 0 }, lift: { limit: 20, used: 0 }, chat: { limit: 40, used: 0 } } });
    }));
    await useAuth.getState().load();
    expect(useAuth.getState()).toMatchObject({ status: "ready", user: null, showSignIn: true });
    await useAuth.getState().guest();
    expect(useAuth.getState().user?.kind).toBe("guest");
    await vi.waitFor(() => expect(useAuth.getState().usage?.buckets.build.remaining).toBe(10));
    expect(calls.every(([, init]) => init?.credentials === "include")).toBe(true);
  });
  it("surfaces a server error message on a failed login", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: "Incorrect email or password." }) })));
    await expect(useAuth.getState().logIn("a@b.co", "x")).rejects.toThrow("Incorrect email or password.");
  });
});
