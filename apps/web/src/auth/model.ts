export type AuthUser = { id: string; kind: "guest" | "account"; email?: string; name?: string; admin: boolean };
export type BucketId = "build" | "lift" | "chat";
export type BucketUsage = { limit: number; used: number; remaining: number };
export type Usage = {
  kind: "anonymous" | "guest" | "account";
  admin: boolean;
  enforced: boolean;
  resetAt: string;
  buckets: Record<BucketId, BucketUsage>;
};
export type MeResponse = { user: AuthUser | null; authRequired: boolean; showSignIn: boolean };

export const BUCKET_LABEL: Record<BucketId, { name: string; noun: string }> = {
  build: { name: "Builds", noun: "builds" },
  lift: { name: "Lifts", noun: "lifts" },
  chat: { name: "Chat", noun: "chat messages" },
};

export function parseMe(data: unknown): MeResponse {
  const d = (data ?? {}) as Partial<MeResponse>;
  const u = d.user;
  const user: AuthUser | null =
    u && typeof u.id === "string" && (u.kind === "guest" || u.kind === "account")
      ? { id: u.id, kind: u.kind, admin: u.admin === true, ...(u.email ? { email: u.email } : {}), ...(u.name ? { name: u.name } : {}) }
      : null;
  return { user, authRequired: d.authRequired === true, showSignIn: d.showSignIn === true };
}

export function parseUsage(data: unknown): Usage | null {
  const d = (data ?? {}) as Partial<Usage>;
  if (!d.buckets || typeof d.resetAt !== "string") return null;
  const buckets = {} as Record<BucketId, BucketUsage>;
  for (const id of ["build", "lift", "chat"] as const) {
    const b = d.buckets[id];
    if (!b || typeof b.limit !== "number" || typeof b.used !== "number") return null;
    buckets[id] = { limit: b.limit, used: b.used, remaining: Math.max(0, b.limit - b.used) };
  }
  return { kind: d.kind ?? "anonymous", admin: d.admin === true, enforced: d.enforced === true, resetAt: d.resetAt, buckets };
}

/** The sign-in screen blocks the app only until a session exists, and only when the server asks for it. */
export function needsSignIn(status: "loading" | "ready", user: AuthUser | null, showSignIn: boolean): boolean {
  return status === "ready" && !user && showSignIn;
}

/** "Daily demo limit reached for builds. It resets at 5:00 PM." */
export function limitMessage(bucket: string | undefined, resetAt: string | undefined, locale?: string): string {
  const noun = BUCKET_LABEL[bucket as BucketId]?.noun ?? "requests";
  const at = resetAt ? new Date(resetAt) : null;
  const when = at && !Number.isNaN(at.getTime()) ? ` It resets at ${at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}.` : "";
  return `Daily demo limit reached for ${noun}.${when}`;
}

export function displayName(user: AuthUser | null): string {
  if (!user) return "Not signed in";
  if (user.kind === "guest") return "Guest";
  return user.name || user.email || "Account";
}
