import { toast } from "../ui/toastStore";
import { limitMessage } from "./model";
import { useAuth } from "./authStore";

/**
 * Inspect a failed response body. Returns a friendly message for the demo limit (and shows a toast),
 * or undefined for any other error. A 401 with code auth_required drops the session so the gate reappears.
 */
export function handleAuthFailure(status: number, data: { error?: string; bucket?: string; resetAt?: string; code?: string }): string | undefined {
  if (status === 429 && data.error === "Demo limit reached") {
    const msg = limitMessage(data.bucket, data.resetAt);
    toast(msg, 5000);
    void useAuth.getState().refreshUsage();
    return msg;
  }
  if (status === 401 && data.code === "auth_required") {
    useAuth.getState().expire();
    return "Sign in to continue.";
  }
  return undefined;
}
