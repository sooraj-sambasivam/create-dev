import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, SCRYPT, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** `scrypt$<salt b64>$<hash b64>` with a fresh 16-byte salt per user. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ---- signed session token: base64url(payload) "." base64url(HMAC-SHA256) ----

export type SessionPayload = { sub: string; kind: "guest" | "account"; exp: number; email?: string };

let fallbackSecret: string | null = null;

/** SESSION_SECRET, or a random per-process secret in dev (sessions then end on restart). */
export function sessionSecret(): string {
  const env = process.env.SESSION_SECRET?.trim();
  if (env) return env;
  if (!fallbackSecret) {
    fallbackSecret = randomBytes(32).toString("hex");
    if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
      console.warn("[auth] SESSION_SECRET is not set: using a random per-process secret, sessions will not survive a restart.");
    }
  }
  return fallbackSecret;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest();

export function signSession(payload: SessionPayload, secret: string = sessionSecret()): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(mac(body, secret))}`;
}

/** Returns the payload only for an untampered, unexpired token. */
export function verifySession(token: string | undefined, now: number = Date.now(), secret: string = sessionSecret()): SessionPayload | null {
  if (!token) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, "base64url");
  const want = mac(body, secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof p.sub !== "string" || (p.kind !== "guest" && p.kind !== "account") || typeof p.exp !== "number") return null;
    return p.exp > now ? { sub: p.sub, kind: p.kind, exp: p.exp, ...(typeof p.email === "string" ? { email: p.email } : {}) } : null;
  } catch {
    return null;
  }
}
