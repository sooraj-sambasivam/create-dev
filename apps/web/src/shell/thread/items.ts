import type { HistoryEntry, Status } from "../../store/screenStore";

export type ThreadItem =
  | { kind: "user"; key: string; text: string }
  | { kind: "assistant"; key: string; text: string; element: boolean; label: string | null; nodeId: string | null }
  | { kind: "answer"; key: string; text: string; label: string | null; suggestCode: boolean; routed: boolean; nodeId: string | null }
  | { kind: "building"; key: string; label: string }
  | { kind: "error"; key: string; message: string; retryPrompt: string | null };

export interface ThreadInput {
  history: readonly HistoryEntry[];
  status: Status;
  /** A Chat-mode question is waiting for its answer. */
  asking?: boolean;
  error: string | null;
  /** Page-level summary not yet in history (e.g. shown right after generation). */
  lastSummary?: string | null;
  /** The build prompt in flight or just failed (not yet in history). */
  lastAttempt?: string | null;
}

/** Prompt placeholder the store writes for edits made without a prompt (canvas, narrate). */
export const EDITED_PROMPT = "(edited)";

/** Pure derivation of the message list from the chat history and status. */
export function deriveItems({ history, status, error, asking, lastAttempt }: ThreadInput): ThreadItem[] {
  const items: ThreadItem[] = [];
  history.forEach((h, i) => {
    if (h.prompt && h.prompt !== EDITED_PROMPT) items.push({ kind: "user", key: `u${i}`, text: h.prompt });
    if (h.summary && h.kind === "answer") {
      items.push({ kind: "answer", key: `a${i}`, text: h.summary, label: h.label ?? null, suggestCode: h.suggestCode === true, routed: h.routed === true, nodeId: h.nodeId ?? null });
    } else if (h.summary) items.push({ kind: "assistant", key: `a${i}`, text: h.summary, element: h.kind === "element", label: h.label ?? null, nodeId: h.nodeId ?? null });
  });
  const attempt = lastAttempt?.trim() || null;
  if (attempt && (status === "loading" || status === "error")) items.push({ kind: "user", key: "attempt", text: attempt });
  if (asking) items.push({ kind: "building", key: "building", label: "Thinking…" });
  else if (status === "loading") items.push({ kind: "building", key: "building", label: "Building your page…" });
  else if (status === "transcribing") items.push({ kind: "building", key: "building", label: "Transcribing…" });
  else if (status === "error") {
    items.push({ kind: "error", key: "error", message: error || "Something went wrong.", retryPrompt: attempt ?? lastPrompt(history) });
  }
  return items;
}

/** The most recent real prompt, used by Retry. */
export function lastPrompt(history: readonly HistoryEntry[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].kind === "answer") continue; // Retry re-runs a build, never a question
    const p = history[i].prompt;
    if (p && p !== EDITED_PROMPT) return p;
  }
  return null;
}
