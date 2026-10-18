import { useEffect, type ReactNode } from "react";
import { useAuth } from "./authStore";
import { needsSignIn } from "./model";
import { SignIn } from "./SignIn";

/** Loads the session once. Shows the sign-in screen instead of the app until a session exists (when the server asks for it). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, showSignIn, load } = useAuth();
  useEffect(() => { void load(); }, [load]);
  if (status === "loading") return <div className="fixed inset-0 bg-shell" aria-busy="true" />;
  if (needsSignIn(status, user, showSignIn)) return <SignIn />;
  return <>{children}</>;
}
