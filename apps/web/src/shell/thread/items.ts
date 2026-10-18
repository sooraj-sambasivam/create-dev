import type { HistoryEntry, Status } from "../../store/screenStore";

export type ThreadItem =
  | { kind: "user"; key: string; text: string }
  | { kind: "assistant"; key: string; text: string; element: boolean }
  | { kind: "building"; key: string; label: string }
  | { kind: "error"; key: string; message: string; retryPrompt: string | null };

export interface ThreadInput {
  history: readonly HistoryEntry[];
  status: Status;
  error: string | null;
  /** Page-level summary not yet in history (e.g. shown right after generation). */
  lastSummary?: string | null;
}

/** Prompt placeholder the store writes for edits made without a prompt (canvas, narrate). */
export const EDITED_PROMPT = "(edited)";

/** Pure derivation of the message list from the chat history and status. */
export function deriveItems({ history, status, error }: ThreadInput): ThreadItem[] {
  const items: ThreadItem[] = [];
  history.forEach((h, i) => {
    if (h.prompt && h.prompt !== EDITED_PROMPT) items.push({ kind: "user", key: `u${i}`, text: h.prompt });
    if (h.summary) items.push({ kind: "assistant", key: `a${i}`, text: h.summary, element: h.kind === "element" });
  });
  if (status === "loading") items.push({ kind: "building", key: "building", label: "Building your page…" });
  else if (status === "transcribing") items.push({ kind: "building", key: "building", label: "Transcribing…" });
  else if (status === "error") {
    items.push({ kind: "error", key: "error", message: error || "Something went wrong.", retryPrompt: lastPrompt(history) });
  }
  return items;
}

/** The most recent real prompt, used by Retry. */
export function lastPrompt(history: readonly HistoryEntry[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const p = history[i].prompt;
    if (p && p !== EDITED_PROMPT) return p;
  }
  return null;
}
