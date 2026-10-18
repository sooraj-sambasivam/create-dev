import type { VoiceSyncSink } from "./voice";
import { createSyncSession, type SyncBinding, type SyncSession, type SyncSessionOptions } from "../sync";
import { boundTargets, pickUtterance, utteranceKey, type BoundTarget } from "./deixis";
import { resolveHoverAt, type HoverHit } from "../modes/narrate/overlay/targets";

/** Words older than this before the utterance's start are not part of it. */
const UTTERANCE_LEAD_MS = 3000;
/** Pointer resolutions closer together than this at the same spot reuse the last answer. */
const RESOLVE_MEMO_MS = 50;

export type Bound = { bound: BoundTarget[]; bindings: SyncBinding[]; final: boolean };

export interface NarrateSync {
  readonly session: SyncSession;
  /** Hand this to createVoice({ sync }). */
  readonly sink: VoiceSyncSink;
  /** performance.now, the timeline's clock. */
  now(): number;
  /** Mark where the current utterance began (performance.now). Bindings for earlier speech are ignored. */
  begin(t?: number): void;
  /** Deictic bindings for the current utterance right now (estimated or final). */
  current(): Bound;
  /** The current utterance's bindings; the next call to current()/finish() will not return them again. */
  finish(): Bound;
  /** Called whenever a binding for the current utterance appears or is refined (the first estimate, then the final one). */
  onBound(cb: (b: Bound) => void): () => void;
  /** The page hit last seen for a node id (area, box), if any. */
  hit(id: string): HoverHit | undefined;
  dispose(): void;
}

export interface NarrateSyncOptions extends Omit<SyncSessionOptions, "pointer"> {
  /** Page resolver; default resolves the data-node-id node in the right panel's live page. */
  resolveHit?: (x: number, y: number) => HoverHit | null;
}

/**
 * One sync session per narrate or hold-to-talk session: pointer ring on the page resolver, voice words from
 * Scribe (exact times) or Web Speech (lag-estimated), and the deictic bindings for the utterance being spoken.
 */
export function createNarrateSync(opts: NarrateSyncOptions = {}): NarrateSync {
  const hits = new Map<string, HoverHit>();
  const resolveHit = opts.resolveHit ?? ((x: number, y: number) => resolveHoverAt(x, y));
  let memo: { x: number; y: number; t: number; r: { targetId: string; label: string } | undefined } | null = null;
  const session = createSyncSession({
    ...opts,
    pointer: {
      hz: 60,
      resolver: (x, y) => {
        const t = performance.now();
        if (memo && memo.x === x && memo.y === y && t - memo.t < RESOLVE_MEMO_MS) return memo.r;
        const h = resolveHit(x, y);
        if (h) hits.set(h.id, h);
        const r = h ? { targetId: h.id, label: h.label } : undefined;
        memo = { x, y, t, r };
        return r;
      },
    },
  });
  const consumed = new Set<string>();
  const subs = new Set<(b: Bound) => void>();
  /** Nothing is current until begin(): stale speech must not bind. */
  let since = Infinity;
  const labelOf = (id: string, fallback?: string) => hits.get(id)?.label ?? fallback ?? id;

  const read = (): Bound => {
    const bindings = pickUtterance(session.snapshot().bindings, since, consumed);
    return { bindings, bound: boundTargets(bindings, labelOf), final: bindings.length > 0 && bindings.every((b) => b.final) };
  };
  const off = session.onBinding((b) => {
    if (b.word.start < since || consumed.has(utteranceKey(b)) || subs.size === 0) return;
    const cur = read();
    for (const cb of subs) cb(cur);
  });
  session.start();

  const sink: VoiceSyncSink = {
    scribe: (msg, arrival) => session.feedScribe(msg, arrival),
    audioStart: (ms) => session.setAudioStart(ms),
    speech: (key, text, final, arrival) => session.feedWebSpeech(key, text, final, arrival),
  };

  return {
    session,
    sink,
    now: () => session.clock.now(),
    begin(t = session.clock.now()) {
      since = Math.min(since, t - UTTERANCE_LEAD_MS);
    },
    current: read,
    finish() {
      const cur = read();
      for (const b of cur.bindings) consumed.add(utteranceKey(b));
      since = Infinity;
      return cur;
    },
    onBound(cb) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    hit: (id) => hits.get(id),
    dispose() {
      off();
      subs.clear();
      session.stop();
    },
  };
}
