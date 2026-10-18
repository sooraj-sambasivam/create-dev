import {
  resolveDeixis,
  TimeRing,
  type DeixisBinding,
  type ResolveOpts,
  type TimedFrame,
  type TimedPointer,
  type TimedWord,
} from "@create/shared";
import { createClock, type SyncClock } from "./clock";
import { createFrameTrack, type FrameSnapshot, type FrameTrack, type FrameTrackDeps } from "./frameTrack";
import { createLagEstimator, DEFAULT_LAG_MS, type LagEstimator } from "./lag";
import { createPointerTrack, type PointerTrack, type PointerTrackDeps } from "./pointerTrack";
import {
  createScribeAdapter,
  createWebSpeechAdapter,
  type ScribeAdapter,
  type ScribeMessage,
  type WebSpeechAdapter,
  type WordUpdate,
} from "./wordTrack";

export * from "./clock";
export * from "./pointerTrack";
export * from "./wordTrack";
export * from "./frameTrack";
export * from "./lag";

export interface SyncBinding extends DeixisBinding {
  /** Stable id for the word (utterance key + index) so consumers can update in place. */
  id: string;
  /** True when the word's timing is final (ASR committed), so the binding will not change. */
  final: boolean;
  /** Screen snapshot nearest to the bound pointer time, if any. */
  frame?: TimedFrame<FrameSnapshot>;
}

export interface SyncSnapshot {
  now: number;
  pointers: TimedPointer[];
  words: TimedWord[];
  frames: Array<TimedFrame<FrameSnapshot>>;
  bindings: SyncBinding[];
  webspeechLagMs: number;
}

export interface SyncSession {
  start(): void;
  stop(): void;
  /** Subscribe to deictic bindings (emitted when new or changed). Returns unsubscribe. */
  onBinding(cb: (b: SyncBinding) => void): () => void;
  snapshot(): SyncSnapshot;

  /* inputs */
  feedScribe(msg: ScribeMessage, arrival?: number): void;
  setAudioStart(ms: number): void;
  feedWebSpeech(key: string, transcript: string, isFinal: boolean, arrival?: number): void;
  feedWords(key: string, words: TimedWord[]): void;
  /** Re-resolve everything now (called automatically on each word update). */
  resolve(): SyncBinding[];

  pointer: PointerTrack;
  frames: FrameTrack;
  lag: LagEstimator;
  clock: SyncClock;
}

export interface SyncSessionOptions {
  clock?: SyncClock;
  pointer?: Omit<PointerTrackDeps, "clock" | "onTargetChange">;
  frames?: Omit<FrameTrackDeps, "clock">;
  resolve?: ResolveOpts;
  /** Max age of words kept for binding (ms). Default 15000. */
  wordWindowMs?: number;
  /** Capture a frame whenever the pointer enters a new target. Default true. */
  captureOnTargetChange?: boolean;
}

export function createSyncSession(opts: SyncSessionOptions = {}): SyncSession {
  const clock = opts.clock ?? createClock();
  const frames = createFrameTrack({ ...opts.frames, clock });
  const lag = createLagEstimator(DEFAULT_LAG_MS.webspeech);
  const captureOnChange = opts.captureOnTargetChange !== false;
  const pointer = createPointerTrack({
    ...opts.pointer,
    clock,
    onTargetChange: (p) => {
      if (captureOnChange && p.targetId) frames.capture({ targetId: p.targetId, label: p.label, x: p.x, y: p.y }, p.t);
    },
  });
  const webspeech: WebSpeechAdapter = createWebSpeechAdapter({ clock, lagMs: () => lag.lagMs() });
  const scribe: ScribeAdapter = createScribeAdapter({ clock, partialLagMs: DEFAULT_LAG_MS.scribePartial });
  const utterances = new Map<string, TimedWord[]>();
  const listeners = new Set<(b: SyncBinding) => void>();
  const emitted = new Map<string, string>();
  const windowMs = opts.wordWindowMs ?? 15_000;
  let latest: SyncBinding[] = [];

  const allWords = (): TimedWord[] =>
    [...utterances.values()].flat().sort((a, b) => (a.start || 0) - (b.start || 0));

  function resolve(): SyncBinding[] {
    const now = clock.now();
    // age out
    for (const [k, ws] of utterances) if (ws.length && ws[ws.length - 1].end < now - windowMs) utterances.delete(k);
    const out: SyncBinding[] = [];
    for (const [key, ws] of utterances) {
      const bs = resolveDeixis(ws, pointer.ring, opts.resolve);
      let bi = 0;
      ws.forEach((w, i) => {
        if (bi >= bs.length || bs[bi].word !== w) return;
        const b = bs[bi++];
        const frame = b.target?.targetId ? frames.forTarget(b.target.targetId, b.t + 1) ?? frames.at(b.t) : frames.at(b.t);
        out.push({ ...b, id: `${key}:${i}`, final: w.final, frame });
      });
    }
    out.sort((a, b) => a.word.start - b.word.start);
    for (const b of out) {
      const sig = `${b.target?.targetId ?? ""}|${b.final}|${Math.round(b.confidence * 100)}|${Math.round(b.t / 20)}`;
      if (emitted.get(b.id) === sig) continue;
      emitted.set(b.id, sig);
      for (const cb of listeners) cb(b);
    }
    latest = out;
    return out;
  }

  function apply(u: WordUpdate) {
    for (const d of u.drop ?? []) utterances.delete(d);
    utterances.set(u.key, u.words);
    // calibrate webspeech lag whenever both sources describe the same speech
    if (u.key.startsWith("scribe:c")) {
      const ws = [...utterances.entries()].filter(([k]) => k.startsWith("ws:")).flatMap(([, v]) => v);
      if (ws.length) lag.observe(ws, u.words);
    }
    resolve();
  }

  return {
    clock,
    pointer,
    frames,
    lag,
    start() {
      pointer.start();
    },
    stop() {
      pointer.stop();
      resolve();
    },
    onBinding(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    snapshot() {
      return {
        now: clock.now(),
        pointers: pointer.ring.toArray(),
        words: allWords(),
        frames: frames.ring.toArray(),
        bindings: latest,
        webspeechLagMs: lag.lagMs(),
      };
    },
    feedScribe(msg, arrival) {
      for (const u of scribe.handle(msg, arrival)) apply(u);
    },
    setAudioStart: (ms) => scribe.setAudioStart(ms),
    feedWebSpeech(key, transcript, isFinal, arrival) {
      apply(webspeech.handle(`ws:${key}`, transcript, isFinal, arrival));
    },
    feedWords(key, words) {
      apply({ key, words });
    },
    resolve,
  };
}

export { TimeRing };
