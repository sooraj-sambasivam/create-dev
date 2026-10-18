import { useState, type FormEvent } from "react";
import { button, focusRing, input, text } from "../ui/styles";
import { useAuth } from "./authStore";

/** Minimal sign-in screen shown before onboarding. Guest is one click. */
export function SignIn() {
  const { logIn, signUp, guest } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => (mode === "login" ? logIn(email, password) : signUp(email, password, name.trim() || undefined)));
  };

  return (
    <main className="fixed inset-0 z-[200] grid place-items-center bg-shell p-4">
      <div className="w-full max-w-[360px] rounded-xl border border-line bg-surface p-6 shadow-soft">
        <h1 className="text-[28px] leading-9 font-normal tracking-[-0.01em] text-ink">Create</h1>
        <p className={`${text.ui} mt-1 text-ink-2`}>{mode === "login" ? "Sign in to continue." : "Make an account to get more daily usage."}</p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          {mode === "signup" && (
            <label className="flex flex-col gap-1">
              <span className={text.meta}>Name (optional)</span>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className={text.meta}>Email</span>
            <input className={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          </label>
          <label className="flex flex-col gap-1">
            <span className={text.meta}>Password</span>
            <input
              className={input}
              type="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {error && <p role="alert" className="text-[12px] leading-4 text-bad">{error}</p>}
          <button type="submit" disabled={busy} className={`${button.primary} w-full`}>
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <div className="my-4 h-px bg-line" />
        <button type="button" disabled={busy} onClick={() => void run(guest)} className={`${button.secondary} w-full`}>
          Continue as guest
        </button>
        <p className={`${text.meta} mt-4 text-center`}>
          {mode === "login" ? "New here? " : "Have an account? "}
          <button
            type="button"
            className={`rounded-md text-ink-2 underline underline-offset-2 hover:text-ink ${focusRing}`}
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
