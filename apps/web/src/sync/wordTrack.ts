import { normalizeWord, type TimedWord, type TimedWordSource } from "@create/shared";
import type { SyncClock } from "./clock";

/** Replace the word list stored under `key`; also drop any keys in `drop`. */
export interface WordUpdate {
  key: string;
  words: TimedWord[];
  drop?: string[];
}

/** Rough spoken duration of one word (ms): ~320 ms for a 4-letter word, clamped. */
export function estimateWordDurationMs(text: string): number {
  const len = normalizeWord(text).length || text.length || 1;
  return Math.max(180, Math.min(700, 140 + 45 * len));
}

/**
 * Lay out `texts` contiguously ending at endT, never starting before floorT
 * (compresses proportionally if the available span is too short).
 */
export function placeWords(texts: string[], endT: number, floorT = -Infinity): Array<{ start: number; end: number }> {
  const durs = texts.map(estimateWordDurationMs);
  const total = durs.reduce((a, b) => a + b, 0);
  let start = endT - total;
  let scale = 1;
  if (start < floorT) {
    const avail = Math.max(endT - floorT, texts.length * 20);
    scale = avail / total;
    start = endT - avail;
  }
  const out: Array<{ start: number; end: number }> = [];
  let t = start;
  for (const d of durs) {
    out.push({ start: t, end: t + d * scale });
    t += d * scale;
  }
  return out;
}

const tokenize = (s: string) => s.split(/\s+/).filter(Boolean);

/** Incrementally estimates word times from growing/revised interim transcripts of one utterance. */
class UtteranceEstimator {
  words: TimedWord[] = [];
  constructor(private source: TimedWordSource) {}

  update(transcript: string, arrival: number, lagMs: number, isFinal: boolean): TimedWord[] {
    const toks = tokenize(transcript);
    const old = this.words;
    const next: TimedWord[] = [];
    const newTexts: string[] = [];
    for (let i = 0; i < toks.length; i++) {
      if (i < old.length) next.push({ ...old[i], text: toks[i], final: isFinal });
      else newTexts.push(toks[i]);
    }
    if (newTexts.length) {
      const floor = next.length ? next[next.length - 1].end : -Infinity;
      const placed = placeWords(newTexts, arrival - lagMs, floor);
      newTexts.forEach((text, i) =>
        next.push({ text, ...placed[i], final: isFinal, source: this.source, arrival }),
      );
    }
    this.words = next;
    return next;
  }
}

export interface WebSpeechAdapter {
  /** Feed one recognition result (interim or final) for utterance `key`. */
  handle(key: string, transcript: string, isFinal: boolean, arrival?: number): WordUpdate;
  reset(): void;
}

/**
 * Web Speech has no word timestamps. When an interim result grows by k words at arrival te,
 * those words were spoken in (te - lag - sum(dur), te - lag], spread by estimated duration.
 */
export function createWebSpeechAdapter(deps: { clock: SyncClock; lagMs: () => number }): WebSpeechAdapter {
  const state = new Map<string, UtteranceEstimator>();
  return {
    handle(key, transcript, isFinal, arrival = deps.clock.now()) {
      let est = state.get(key);
      if (!est) state.set(key, (est = new UtteranceEstimator("webspeech")));
      const words = est.update(transcript, arrival, deps.lagMs(), isFinal);
      if (isFinal) state.delete(key);
      return { key, words };
    },
    reset: () => state.clear(),
  };
}

/* ----------------------------------------------------------------------- Scribe */

export interface ScribeWordMsg {
  text: string;
  start?: number;
  end?: number;
  type?: "word" | "spacing" | string;
}
export interface ScribeMessage {
  message_type: string;
  text?: string;
  words?: ScribeWordMsg[];
}

export interface ScribeAdapter {
  /** performance.now of the first audio sample sent on the socket. */
  setAudioStart(ms: number): void;
  readonly audioStart: number | null;
  handle(msg: ScribeMessage, arrival?: number): WordUpdate[];
  reset(): void;
}

export const SCRIBE_PARTIAL_KEY = "scribe:partial";

export function createScribeAdapter(deps: {
  clock: SyncClock;
  audioStartMs?: number;
  partialLagMs?: number;
  /** lag applied when a committed message has no usable timestamps. */
  committedLagMs?: number;
}): ScribeAdapter {
  let audioStart: number | null = deps.audioStartMs ?? null;
  let partial = new UtteranceEstimator("scribe");
  let commitN = 0;
  let last: { key: string; text: string; exact: boolean } | null = null;
  const partialLag = deps.partialLagMs ?? 200;
  const committedLag = deps.committedLagMs ?? 80;

  const norm = (s: string) => tokenize(s).map(normalizeWord).join(" ");

  function commit(text: string, exactWords: TimedWord[] | null, arrival: number): WordUpdate {
    // reuse the key when the same segment arrives twice (committed_transcript then ..._with_timestamps)
    const reuse = last && norm(last.text) === norm(text) && (exactWords ? !last.exact : false);
    const key = reuse ? last!.key : `scribe:c${commitN++}`;
    let words: TimedWord[];
    if (exactWords) {
      words = exactWords;
    } else {
      const prev = partial.words;
      const toks = tokenize(text);
      if (prev.length === toks.length && prev.length > 0) {
        words = prev.map((w, i) => ({ ...w, text: toks[i], final: true }));
      } else {
        const placed = placeWords(toks, arrival - committedLag);
        words = toks.map((t, i) => ({ text: t, ...placed[i], final: true, source: "scribe" as const, arrival }));
      }
    }
    last = { key, text, exact: !!exactWords };
    partial = new UtteranceEstimator("scribe");
    return { key, words, drop: [SCRIBE_PARTIAL_KEY] };
  }

  return {
    get audioStart() {
      return audioStart;
    },
    setAudioStart(ms) {
      audioStart = ms;
    },
    handle(msg, arrival = deps.clock.now()) {
      switch (msg.message_type) {
        case "partial_transcript": {
          const text = (msg.text ?? "").trim();
          if (!text) return [];
          return [{ key: SCRIBE_PARTIAL_KEY, words: partial.update(text, arrival, partialLag, false) }];
        }
        case "committed_transcript": {
          const text = (msg.text ?? "").trim();
          return text ? [commit(text, null, arrival)] : [];
        }
        case "committed_transcript_with_timestamps": {
          const text = (msg.text ?? "").trim();
          const ws = (msg.words ?? []).filter((w) => w.type !== "spacing" && w.text?.trim());
          const exact =
            audioStart !== null &&
            ws.length > 0 &&
            ws.every((w) => Number.isFinite(w.start) && Number.isFinite(w.end));
          if (!exact) return text ? [commit(text, null, arrival)] : [];
          const words: TimedWord[] = ws.map((w) => ({
            text: w.text.trim(),
            start: audioStart! + w.start! * 1000,
            end: audioStart! + w.end! * 1000,
            final: true,
            source: "scribe",
            arrival,
          }));
          return [commit(text || words.map((w) => w.text).join(" "), words, arrival)];
        }
        default:
          return [];
      }
    },
    reset() {
      partial = new UtteranceEstimator("scribe");
      last = null;
      commitN = 0;
    },
  };
}

/** Words injected with known times (tests, harness, typed commands). */
export function injectedWords(items: Array<{ text: string; start: number; end?: number }>): TimedWord[] {
  return items.map((i) => ({
    text: i.text,
    start: i.start,
    end: i.end ?? i.start + estimateWordDurationMs(i.text),
    final: true,
    source: "injected" as const,
  }));
}
