export type Bucket = "build" | "lift" | "chat";
export const BUCKETS: readonly Bucket[] = ["build", "lift", "chat"];

/** Daily caps for a guest. An account gets ACCOUNT_MULTIPLIER times these. */
export const GUEST_LIMITS: Record<Bucket, number> = { build: 10, lift: 20, chat: 40 };
export const ACCOUNT_MULTIPLIER = 3;
/** Per-IP daily cap is this many times the guest cap, so one network cannot farm fresh guests. */
export const IP_MULTIPLIER = 5;

export type Subject = { kind: "anonymous" | "guest" | "account"; id: string; admin: boolean };

export function limitFor(kind: Subject["kind"], bucket: Bucket): number {
  return GUEST_LIMITS[bucket] * (kind === "account" ? ACCOUNT_MULTIPLIER : 1);
}
export function ipLimitFor(bucket: Bucket): number {
  return GUEST_LIMITS[bucket] * IP_MULTIPLIER;
}

/** Cost routes (POST) and the bucket each draws from. /locate counts only in commit mode (see gate). */
export const ROUTE_BUCKETS: Record<string, Bucket> = {
  "/generate": "build",
  "/generate-sketch": "build",
  "/canvas-ops": "build",
  "/lift": "lift",
  "/extract": "lift",
  "/locate": "lift",
  "/ask": "chat",
  "/edit-node": "chat",
};

export function adminEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.DEMO_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** UTC day key and the next UTC midnight. */
export function dayWindow(now: number): { day: string; resetAt: string } {
  const d = new Date(now);
  const day = d.toISOString().slice(0, 10);
  const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return { day, resetAt: new Date(reset).toISOString() };
}
