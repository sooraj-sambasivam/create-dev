import { isDeictic, normalizeWord, type IntentRequest } from "@create/shared";
import type { SyncBinding } from "../sync";

/** One deictic word ("this", "here") resolved to the page node the pointer was on when it was said. */
export type BoundTarget = {
  /** Binding id (utterance key + word index): stable while the binding is refined. */
  id: string;
  word: string;
  wordStart: number;
  targetId: string;
  label: string;
  confidence: number;
  /** True once the recognizer committed the word's timing. */
  final: boolean;
};

/** The utterance a binding belongs to: its id without the trailing word index. */
export const utteranceKey = (b: Pick<SyncBinding, "id">): string => b.id.slice(0, b.id.lastIndexOf(":"));

/**
 * The deictic bindings of every utterance that started at or after `since` and was not handed out before, in spoken order.
 * (One line can arrive as several commits when the speaker pauses; they belong together.) Words with no target keep their
 * place (null target) so a transcript can be aligned.
 */
export function pickUtterance(all: readonly SyncBinding[], since: number, consumed: ReadonlySet<string> = new Set()): SyncBinding[] {
  return all.filter((b) => b.word.start >= since && !consumed.has(utteranceKey(b))).sort((a, b) => a.word.start - b.word.start);
}

/** Bindings that landed on a page node, with labels taken from `labelOf` (the raw node label), in spoken order. */
export function boundTargets(bs: readonly SyncBinding[], labelOf: (id: string, fallback?: string) => string): BoundTarget[] {
  const out: BoundTarget[] = [];
  for (const b of bs) {
    const id = b.target?.targetId;
    if (!id) continue;
    out.push({
      id: b.id,
      word: b.word.text,
      wordStart: b.word.start,
      targetId: id,
      label: labelOf(id, b.target?.label),
      confidence: b.confidence,
      final: b.final,
    });
  }
  return out;
}

/** The distinct targets in spoken order: "move this here" over two nodes gives [source, destination]. */
export function distinctTargets(bound: readonly BoundTarget[]): BoundTarget[] {
  const seen = new Set<string>();
  return bound.filter((b) => (seen.has(b.targetId) ? false : (seen.add(b.targetId), true)));
}

const prettyLabel = (label: string): string => {
  const i = label.indexOf(": ");
  const head = (i < 0 ? label : label.slice(0, i)).replace(/^./, (c) => c.toUpperCase());
  return i < 0 ? head : `${head} · ${label.slice(i + 2)}`;
};

/**
 * "Move this over here" with two different targets becomes "Move this (Heading · Welcome) over here (Section · Pricing)",
 * so the router and the editor see which thing each word meant. One target (or none) leaves the text alone.
 */
export function annotateTranscript(text: string, bindings: readonly SyncBinding[], labelOf: (b: SyncBinding) => string | null): string {
  const targets = new Set(bindings.map((b) => b.target?.targetId).filter(Boolean));
  if (targets.size < 2) return text;
  let k = 0;
  let aligned = true;
  const out = text.replace(/\S+/g, (tok) => {
    if (!isDeictic(tok)) return tok;
    const b = bindings[k++];
    if (!b || normalizeWord(b.word.text) !== normalizeWord(tok)) {
      aligned = false;
      return tok;
    }
    const label = labelOf(b);
    if (!label) return tok;
    // Keep trailing punctuation after the note: "here," -> "here (Section · Pricing),".
    const m = /^(.*?)([^\p{L}\p{N}']*)$/u.exec(tok);
    return `${m?.[1] ?? tok} (${label})${m?.[2] ?? ""}`;
  });
  return aligned ? out : text;
}

/**
 * An intent request from bound targets: the candidates are the distinct targets in spoken order and the pointer is the
 * first one (the source of a move). Null when nothing was bound.
 */
export function requestFromBound(transcript: string, bound: readonly BoundTarget[]): IntentRequest | null {
  const text = transcript.trim().slice(0, 4000);
  const targets = distinctTargets(bound);
  if (!text || targets.length === 0) return null;
  const candidates = targets.slice(0, 100).map((t) => ({ id: t.targetId, label: t.label.slice(0, 200), kind: "node" as const }));
  return { transcript: text, candidates, pointer: { targetId: candidates[0].id, label: candidates[0].label } };
}
