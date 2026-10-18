import type { HistoryEntry, Status } from "../../store/screenStore";
import { editResult, liftResult, type LiftEntry, type LiveRun, type ResultData, type RunKind, type StepRecord } from "./runs";

/** Every item carries the turn it belongs to, so the thread can group a turn and space turns apart. */
interface Base {
  key: string;
  turn: number;
}

export type ThreadItem =
  | (Base & { kind: "user"; text: string })
  /** "Built in 12s ›": the finished run, expandable to its step log. */
  | (Base & { kind: "run"; run: RunKind; ms: number; steps: StepRecord[] })
  | (Base & { kind: "assistant"; text: string; element: boolean; label: string | null; nodeId: string | null })
  | (Base & { kind: "answer"; text: string; label: string | null; suggestCode: boolean; routed: boolean; nodeId: string | null })
  /** One card per action. `undoable` only on the newest page or element change. */
  | (Base & { kind: "result"; result: ResultData; action: "page" | "app"; url: string | null; undoable: boolean })
  /** A staged change waiting for Apply / Discard (Approve for me is off). */
  | (Base & { kind: "review"; label: string; summary: string; staging: boolean })
  /** Copy, Read aloud, Good, Bad, Share link, Retry under a finished assistant turn. */
  | (Base & { kind: "actions"; text: string; retry: { prompt: string; as: "build" | "ask" } | null; latest: boolean })
  | (Base & { kind: "building"; label: string; run: LiveRun | null })
  | (Base & { kind: "error"; message: string; retryPrompt: string | null });

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
  /** The run in flight, for its live step log. */
  run?: LiveRun | null;
  /** A staged change waiting for review, or still being prepared. */
  pending?: { label: string; summary: string } | null;
  staging?: boolean;
  /** Regions lifted into apps this session, and a lift in flight. */
  lifts?: readonly LiftEntry[];
  lifting?: boolean;
  /** The page has an undo step to go back to. */
  canUndo?: boolean;
}

/** Prompt placeholder the store writes for edits made without a prompt (canvas, narrate). */
export const EDITED_PROMPT = "(edited)";

const RUN_OF: Record<NonNullable<HistoryEntry["kind"]>, RunKind> = { page: "build", element: "edit", answer: "ask" };

/** Pure derivation of the message list from the chat history and status. */
export function deriveItems({ history, status, error, asking, lastAttempt, run, pending, staging, lifts = [], lifting, canUndo }: ThreadInput): ThreadItem[] {
  const items: ThreadItem[] = [];
  let turn = 0;

  const pushLifts = (at: (l: LiftEntry) => boolean) => {
    for (const l of lifts) {
      if (!at(l)) continue;
      turn++;
      items.push({ kind: "run", key: `lr${l.id}`, turn, run: "lift", ms: l.ms, steps: l.steps });
      items.push({ kind: "result", key: `lc${l.id}`, turn, result: liftResult(l), action: "app", url: l.url, undoable: false });
    }
  };

  history.forEach((h, i) => {
    pushLifts((l) => l.afterCount === i);
    const hasPrompt = Boolean(h.prompt) && h.prompt !== EDITED_PROMPT;
    if (hasPrompt || turn === 0) turn++;
    if (hasPrompt) items.push({ kind: "user", key: `u${i}`, turn, text: h.prompt });
    if (h.ms !== undefined && h.kind) items.push({ kind: "run", key: `r${i}`, turn, run: RUN_OF[h.kind], ms: h.ms, steps: h.steps ?? [] });
    if (h.summary && h.kind === "answer") {
      items.push({ kind: "answer", key: `a${i}`, turn, text: h.summary, label: h.label ?? null, suggestCode: h.suggestCode === true, routed: h.routed === true, nodeId: h.nodeId ?? null });
    } else if (h.summary) {
      items.push({ kind: "assistant", key: `a${i}`, turn, text: h.summary, element: h.kind === "element", label: h.label ?? null, nodeId: h.nodeId ?? null });
    }
    const result = h.result ?? (h.kind === "element" && h.label ? editResult(h.label, h.summary) : null);
    if (result && (h.kind === "page" || h.kind === "element")) {
      items.push({ kind: "result", key: `c${i}`, turn, result, action: "page", url: null, undoable: false });
    }
    if (h.summary && hasPrompt) {
      const retry = { prompt: h.prompt, as: h.kind === "answer" ? ("ask" as const) : ("build" as const) };
      items.push({ kind: "actions", key: `x${i}`, turn, text: h.summary, retry, latest: false });
    } else if (h.summary) {
      items.push({ kind: "actions", key: `x${i}`, turn, text: h.summary, retry: null, latest: false });
    }
  });
  pushLifts((l) => l.afterCount >= history.length);

  // Only the newest page or element change can be undone, and only while there is something to undo.
  if (canUndo) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === "result" && it.action === "page") {
        items[i] = { ...it, undoable: true };
        break;
      }
    }
  }
  // The newest finished turn keeps its action row visible; older rows show on hover.
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "actions") {
      items[i] = { ...it, latest: true };
      break;
    }
  }

  const attempt = lastAttempt?.trim() || null;
  if (attempt && (status === "loading" || status === "error")) {
    turn++;
    items.push({ kind: "user", key: `u${history.length}`, turn, text: attempt });
  }
  if (pending || staging) {
    items.push({ kind: "review", key: "review", turn: Math.max(turn, 1), label: pending?.label ?? "", summary: pending?.summary ?? "", staging: !pending });
  }
  const live = run ?? null;
  if (asking) items.push({ kind: "building", key: "building", turn, label: "Thinking…", run: live });
  else if (lifting) items.push({ kind: "building", key: "building", turn: turn + 1, label: "Lifting into an app…", run: live });
  else if (status === "loading") items.push({ kind: "building", key: "building", turn, label: "Building your page…", run: live });
  else if (status === "transcribing") items.push({ kind: "building", key: "building", turn, label: "Turning your voice into text…", run: null });
  else if (status === "error") {
    items.push({ kind: "error", key: "error", turn, message: error || "Something went wrong. Try again.", retryPrompt: attempt ?? lastPrompt(history) });
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

/** Items grouped by turn, in order. The thread renders one section per turn. */
export function groupTurns(items: readonly ThreadItem[]): { turn: number; items: ThreadItem[] }[] {
  const out: { turn: number; items: ThreadItem[] }[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.turn === it.turn) last.items.push(it);
    else out.push({ turn: it.turn, items: [it] });
  }
  return out;
}
