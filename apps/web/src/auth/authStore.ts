import { create } from "zustand";
import { parseMe, parseUsage, type AuthUser, type Usage } from "./model";

interface AuthState {
  status: "loading" | "ready";
  user: AuthUser | null;
  showSignIn: boolean;
  authRequired: boolean;
  usage: Usage | null;
  load: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  guest: () => Promise<void>;
  logOut: () => Promise<void>;
  /** The server said 401: the session is gone. */
  expire: () => void;
}

async function send(path: string, body?: unknown): Promise<{ user?: AuthUser }> {
  const res = await fetch(`/api/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; user?: unknown };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return { user: parseMe({ user: data.user }).user ?? undefined };
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  showSignIn: false,
  authRequired: false,
  usage: null,
  load: async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const me = parseMe(await res.json());
      set({ status: "ready", user: me.user, showSignIn: me.showSignIn, authRequired: me.authRequired });
      if (me.user) void get().refreshUsage();
    } catch {
      // Server unreachable or older server without auth: do not block the app.
      set({ status: "ready", user: null, showSignIn: false });
    }
  },
  refreshUsage: async () => {
    try {
      const res = await fetch("/api/usage", { credentials: "include" });
      if (res.ok) set({ usage: parseUsage(await res.json()) });
    } catch {
      /* usage is informational */
    }
  },
  signUp: async (email, password, name) => {
    const { user } = await send("signup", { email, password, ...(name ? { name } : {}) });
    set({ user: user ?? null });
    void get().refreshUsage();
  },
  logIn: async (email, password) => {
    const { user } = await send("login", { email, password });
    set({ user: user ?? null });
    void get().refreshUsage();
  },
  guest: async () => {
    const { user } = await send("guest");
    set({ user: user ?? null });
    void get().refreshUsage();
  },
  logOut: async () => {
    await send("logout").catch(() => {});
    set({ user: null, usage: null });
  },
  expire: () => set({ user: null, usage: null }),
}));
