import type { Screen } from "@create/shared";
import type { HistoryEntry } from "../../store/screenStore";
import { findForms } from "../../components/forms";
import { analyzeScreen, type LiftEntry } from "../thread/runs";

export interface ContextStats {
  /** Element edits plus the sections a page refinement added, changed or removed. */
  edited: number;
  /** Form submissions received (0 until the Backend has been asked). */
  rowsReceived: number;
  dataSources: number;
  forms: number;
  /** Distinct sites or files regions were lifted from. */
  imports: string[];
}

const CHANGE_STATS = new Set(["added", "changed", "removed"]);

/** Counts for the context card, derived from the chat history, the page and this session's lifts. */
export function contextStats(input: {
  history: readonly HistoryEntry[];
  screen: Screen | null;
  lifts?: readonly LiftEntry[];
  rowsReceived?: number;
}): ContextStats {
  let edited = 0;
  for (const h of input.history) {
    if (h.kind === "element") edited++;
    else if (h.kind === "page" && h.result?.title === "Updated page") {
      edited += h.result.rows.filter((r) => r.stat !== undefined && CHANGE_STATS.has(r.stat)).length;
    }
  }
  const imports: string[] = [];
  for (const l of input.lifts ?? []) if (l.sourceTitle && !imports.includes(l.sourceTitle)) imports.push(l.sourceTitle);
  return {
    edited,
    rowsReceived: input.rowsReceived ?? 0,
    dataSources: analyzeScreen(input.screen).data,
    forms: input.screen ? findForms(input.screen).length : 0,
    imports,
  };
}
