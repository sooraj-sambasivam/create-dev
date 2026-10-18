import express, { Router, type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { createRateLimiter } from "../middleware/rateLimit";
import { adminEmails } from "../quota/limits";
import { hashPassword, signSession, verifyPassword, verifySession, type SessionPayload } from "./crypto";
import { DuplicateEmailError, defaultUserStore, type UserStore } from "./store";

export const COOKIE_NAME = "create_session";
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
// Verified against when the email is unknown so login timing does not reveal which emails exist.
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}

export function authRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTH_REQUIRED === "1" || env.AUTH_REQUIRED === "true";
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* skip malformed */ }
  }
  return out;
}

/** Reads the signed cookie into req.session. Never rejects; an absent or bad cookie is just anonymous. */
export function attachSession(req: Request, _res: Response, next: NextFunction): void {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const s = verifySession(token);
  if (s) req.session = s;
  next();
}

function secureCookie(req: Request): boolean {
  return req.secure || req.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production";
}

function setSession(req: Request, res: Response, payload: Omit<SessionPayload, "exp">): void {
  const exp = Date.now() + SESSION_MS;
  const token = signSession({ ...payload, exp });
  const attrs = [`${COOKIE_NAME}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${SESSION_MS / 1000}`];
  if (secureCookie(req)) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearSession(req: Request, res: Response): void {
  const attrs = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secureCookie(req)) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

export type PublicUser = { id: string; kind: "guest" | "account"; email?: string; name?: string; admin: boolean };

function isAdmin(email: string | undefined): boolean {
  return Boolean(email) && adminEmails().includes(email!.toLowerCase());
}

function readCreds(body: unknown): { email: string; password: string; name?: string } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters for the password.` };
  if (password.length > MAX_PASSWORD) return { error: "That password is too long." };
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  return { email, password, ...(name ? { name } : {}) };
}

export function createAuthRouter(store: UserStore = defaultUserStore()): Router {
  const r = Router();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });
  const json = express.json({ limit: "8kb" });

  r.post("/auth/signup", limiter, json, async (req, res, next) => {
    try {
      const c = readCreds(req.body);
      if ("error" in c) return void res.status(400).json({ error: c.error });
      const passwordHash = await hashPassword(c.password);
      const u = await store.create({ email: c.email, passwordHash, ...(c.name ? { name: c.name } : {}) });
      setSession(req, res, { sub: u.id, kind: "account", email: u.email });
      const user: PublicUser = { id: u.id, kind: "account", email: u.email, ...(u.name ? { name: u.name } : {}), admin: isAdmin(u.email) };
      res.status(201).json({ user });
    } catch (err) {
      if (err instanceof DuplicateEmailError) return void res.status(409).json({ error: "An account with that email already exists. Sign in instead." });
      next(err);
    }
  });

  r.post("/auth/login", limiter, json, async (req, res, next) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
      const password = typeof b.password === "string" ? b.password : "";
      if (!email || !password || password.length > MAX_PASSWORD) return void res.status(400).json({ error: "Enter your email and password." });
      const u = await store.byEmail(email);
      const ok = await verifyPassword(password, u?.passwordHash ?? DUMMY_HASH);
      if (!u || !ok) return void res.status(401).json({ error: "Incorrect email or password." });
      setSession(req, res, { sub: u.id, kind: "account", email: u.email });
      const user: PublicUser = { id: u.id, kind: "account", email: u.email, ...(u.name ? { name: u.name } : {}), admin: isAdmin(u.email) };
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  r.post("/auth/guest", limiter, (req, res) => {
    // Keep an existing guest identity so reloading the page does not reset its quota.
    const sub = req.session?.kind === "guest" ? req.session.sub : `guest_${randomUUID()}`;
    setSession(req, res, { sub, kind: "guest" });
    const user: PublicUser = { id: sub, kind: "guest", admin: false };
    res.json({ user });
  });

  r.post("/auth/logout", (req, res) => {
    clearSession(req, res);
    res.json({ ok: true });
  });

  r.get("/auth/me", async (req, res, next) => {
    try {
      const s = req.session;
      // The sign-in screen shows when accounts are required or real (paid) AI is on; mock servers skip it.
      const base = { authRequired: authRequired(), showSignIn: authRequired() || process.env.MOCK_AI !== "1" };
      if (!s) return void res.json({ ...base, user: null });
      if (s.kind === "guest") return void res.json({ ...base, user: { id: s.sub, kind: "guest", admin: false } satisfies PublicUser });
      const u = await store.byId(s.sub);
      if (!u) return void res.json({ ...base, user: null });
      res.json({ ...base, user: { id: u.id, kind: "account", email: u.email, ...(u.name ? { name: u.name } : {}), admin: isAdmin(u.email) } satisfies PublicUser });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
