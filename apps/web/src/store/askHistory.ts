import type { HistoryEntry } from "./screenStore";

export interface AskTurn {
  role: "user" | "assistant";
  text: string;
}

const MAX_TURNS = 10;
const MAX_TEXT = 4000;

/** The last thread turns (user and assistant messages, prompt-less edits skipped) in the shape /api/ask takes. */
export function askHistory(history: readonly HistoryEntry[], limit = MAX_TURNS): AskTurn[] {
  const turns: AskTurn[] = [];
  for (const h of history) {
    if (h.prompt && h.prompt !== "(edited)") turns.push({ role: "user", text: h.prompt.slice(0, MAX_TEXT) });
    if (h.summary) turns.push({ role: "assistant", text: h.summary.slice(0, MAX_TEXT) });
  }
  return turns.slice(-limit);
}
