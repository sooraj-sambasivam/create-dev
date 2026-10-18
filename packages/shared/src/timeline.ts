/**
 * Synchronization timeline core (pure, no DOM). All times are milliseconds on ONE
 * monotonic clock (performance.now in the browser). See apps/web/src/sync/clock.ts.
 */

export interface TimedPointer {
  t: number;
  x: number;
  y: number;
  targetId?: string;
  label?: string;
}

export type TimedWordSource = "scribe" | "webspeech" | "injected";

export interface TimedWord {
  text: string;
  /** ms on the shared clock, already corrected for ASR lag. */
  start: number;
  end: number;
  final: boolean;
  source: TimedWordSource;
  /** When the recognizer delivered this word (used for lag estimation). */
  arrival?: number;
}

export interface TimedFrame<R = unknown> {
  t: number;
  ref: R;
}

/* ------------------------------------------------------------------ ring buffer */

/**
 * Fixed-capacity ring of time-ordered items. push is O(1) amortized; every lookup is
 * O(log n) binary search. Out-of-order pushes are clamped to the newest timestamp.
 */
export class TimeRing<T extends { t: number }> {
  private buf: Array<T | undefined>;
  private head = 0;
  private n = 0;

  constructor(
    readonly capacity: number,
    /** Optional retention window relative to the newest item. */
    readonly maxAgeMs?: number,
  ) {
    if (!(capacity >= 1)) throw new Error("capacity must be >= 1");
    this.buf = new Array(capacity);
  }

  get length(): number {
    return this.n;
  }

  /** i-th oldest item (0 = oldest). */
  get(i: number): T {
    return this.buf[(this.head + i) % this.capacity] as T;
  }

  first(): T | undefined {
    return this.n ? this.get(0) : undefined;
  }

  last(): T | undefined {
    return this.n ? this.get(this.n - 1) : undefined;
  }

  push(item: T): T {
    const last = this.last();
    if (last && item.t < last.t) item = { ...item, t: last.t };
    if (this.n === this.capacity) {
      this.buf[this.head] = item;
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.buf[(this.head + this.n) % this.capacity] = item;
      this.n++;
    }
    if (this.maxAgeMs !== undefined) {
      const cutoff = item.t - this.maxAgeMs;
      while (this.n > 1 && this.get(0).t < cutoff) {
        this.buf[this.head] = undefined;
        this.head = (this.head + 1) % this.capacity;
        this.n--;
      }
    }
    return item;
  }

  clear(): void {
    this.buf = new Array(this.capacity);
    this.head = 0;
    this.n = 0;
  }

  /** First index whose t >= t (length if none). */
  lowerBound(t: number): number {
    let lo = 0;
    let hi = this.n;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.get(mid).t < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Index of the last item with item.t <= t, or -1. */
  atOrBefore(t: number): number {
    let lo = 0;
    let hi = this.n;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.get(mid).t <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }

  /** Index of the closest item in time, or -1 when empty. */
  nearestIndex(t: number): number {
    if (!this.n) return -1;
    const b = this.atOrBefore(t);
    if (b < 0) return 0;
    if (b >= this.n - 1) return this.n - 1;
    return t - this.get(b).t <= this.get(b + 1).t - t ? b : b + 1;
  }

  nearest(t: number): T | undefined {
    const i = this.nearestIndex(t);
    return i < 0 ? undefined : this.get(i);
  }

  /** Items with t0 <= t <= t1, oldest first. */
  range(t0: number, t1: number): T[] {
    const out: T[] = [];
    for (let i = this.lowerBound(t0); i < this.n; i++) {
      const it = this.get(i);
      if (it.t > t1) break;
      out.push(it);
    }
    return out;
  }

  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.n; i++) out.push(this.get(i));
    return out;
  }
}

/** Generic interpolation between the two samples bracketing t (clamped at the ends). */
export function interpolateAt<T extends { t: number }>(
  ring: TimeRing<T>,
  t: number,
  lerp: (a: T, b: T, f: number) => T,
): T | undefined {
  const n = ring.length;
  if (!n) return undefined;
  const i = ring.atOrBefore(t);
  if (i < 0) return ring.get(0);
  if (i >= n - 1) return ring.get(n - 1);
  const a = ring.get(i);
  const b = ring.get(i + 1);
  const span = b.t - a.t;
  if (span <= 0) return b;
  return lerp(a, b, (t - a.t) / span);
}

export function pointerAt(ring: TimeRing<TimedPointer>, t: number): TimedPointer | undefined {
  return interpolateAt(ring, t, (a, b, f) => ({
    t: a.t + (b.t - a.t) * f,
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    // target identity is a step function: the sample at or before t wins
    targetId: a.targetId,
    label: a.label,
  }));
}

/* ----------------------------------------------------------------------- deixis */

const DEICTICS = new Set(["this", "that", "these", "those", "here", "there", "it", "one"]);

export function normalizeWord(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
}

export function isDeictic(word: TimedWord | string): boolean {
  return DEICTICS.has(normalizeWord(typeof word === "string" ? word : word.text));
}

export interface DeixisTarget {
  targetId?: string;
  label?: string;
  x: number;
  y: number;
}

export interface DeixisBinding {
  word: TimedWord;
  /** Pointer lookup time actually used (word.start - lagMs; midpoint for estimated words). */
  t: number;
  target: DeixisTarget | null;
  /** 0..1 */
  confidence: number;
  /** Why this target was chosen. */
  mode: "dwell" | "recent" | "approaching" | "sweep" | "none";
}

export interface ResolveOpts {
  /** Extra lag to subtract from word.start. Words from adapters are already lag-corrected, so default 0. */
  lagMs?: number;
  /** A target counts as "held" if the pointer stayed on it at least this long. Default 120. */
  dwellMs?: number;
  /** Search radius around the lookup time. Default 500. */
  windowMs?: number;
  /** Pointer speed (px/ms) above which the pointer counts as sweeping. Default 1.2. */
  fastPxPerMs?: number;
  /** Gaps between samples longer than this are not counted as dwell. Default 250. */
  maxGapMs?: number;
}

interface Run {
  targetId?: string;
  label?: string;
  start: number;
  end: number;
  x: number;
  y: number;
}

function buildRuns(ring: TimeRing<TimedPointer>, t0: number, t1: number, maxGap: number): Run[] {
  const n = ring.length;
  if (!n) return [];
  let a = Math.max(0, ring.atOrBefore(t0));
  let b = Math.min(n - 1, ring.lowerBound(t1));
  // extend outwards so runs that straddle the window have their true extent
  while (a > 0 && ring.get(a - 1).targetId === ring.get(a).targetId) a--;
  while (b < n - 1 && ring.get(b + 1).targetId === ring.get(b).targetId) b++;
  const runs: Run[] = [];
  let cur: { s: number; sumX: number; sumY: number; cnt: number; first: TimedPointer } | null = null;
  const close = (lastIdx: number) => {
    if (!cur) return;
    const last = ring.get(lastIdx);
    const nxt = lastIdx + 1 < n ? ring.get(lastIdx + 1) : undefined;
    const end = Math.min(nxt ? nxt.t : last.t, last.t + maxGap);
    runs.push({
      targetId: cur.first.targetId,
      label: cur.first.label,
      start: cur.s,
      end: Math.max(end, last.t),
      x: cur.sumX / cur.cnt,
      y: cur.sumY / cur.cnt,
    });
    cur = null;
  };
  for (let i = a; i <= b; i++) {
    const p = ring.get(i);
    if (cur && cur.first.targetId !== p.targetId) close(i - 1);
    if (!cur) cur = { s: p.t, sumX: 0, sumY: 0, cnt: 0, first: p };
    cur.sumX += p.x;
    cur.sumY += p.y;
    cur.cnt++;
  }
  close(b);
  return runs;
}

function speedAt(ring: TimeRing<TimedPointer>, t: number): number {
  const n = ring.length;
  if (n < 2) return 0;
  const i = ring.atOrBefore(t);
  const a = ring.get(Math.max(0, Math.min(n - 2, i)));
  const b = ring.get(Math.max(0, Math.min(n - 2, i)) + 1);
  // widen to ~60 ms so single jittery samples don't dominate
  let lo = ring.atOrBefore(t - 30);
  let hi = ring.lowerBound(t + 30);
  lo = Math.max(0, Math.min(lo < 0 ? 0 : lo, n - 2));
  hi = Math.min(n - 1, Math.max(hi, lo + 1));
  const p = ring.get(lo);
  const q = ring.get(hi);
  const dt = q.t - p.t;
  if (dt <= 0) {
    const d2 = b.t - a.t;
    return d2 > 0 ? Math.hypot(b.x - a.x, b.y - a.y) / d2 : 0;
  }
  return Math.hypot(q.x - p.x, q.y - p.y) / dt;
}

const toTarget = (r: Run): DeixisTarget => ({ targetId: r.targetId, label: r.label, x: r.x, y: r.y });

function bindOne(ring: TimeRing<TimedPointer>, word: TimedWord, o: Required<ResolveOpts>): DeixisBinding {
  const none = (t: number): DeixisBinding => ({ word, t, target: null, confidence: 0, mode: "none" });
  // Exact timings (Scribe committed, injected) use word.start. Estimated timings (Web Speech,
  // interim Scribe) have far more uncertainty at the start than the end, so use the midpoint.
  const exact = word.source === "injected" || (word.source === "scribe" && word.final);
  const t = (exact ? word.start : (word.start + word.end) / 2) - o.lagMs;
  if (!Number.isFinite(t) || ring.length === 0) return none(t);

  const runs = buildRuns(ring, t - o.windowMs, t + o.windowMs, o.maxGapMs);
  const dur = (r: Run) => r.end - r.start;
  let instIdx = runs.findIndex((r) => r.start <= t && t < r.end);
  if (instIdx < 0) {
    // between samples/after the last: nearest run starting at or before t, else the first
    let k = -1;
    runs.forEach((r, i) => {
      if (r.start <= t) k = i;
    });
    instIdx = k < 0 ? 0 : k;
  }
  const inst = runs[instIdx];
  const speed = speedAt(ring, t);
  const fast = speed > o.fastPxPerMs;
  const outside = t < (ring.first()?.t ?? 0) - o.maxGapMs;

  if (inst?.targetId && dur(inst) >= o.dwellMs && !fast) {
    const conf = 0.55 + 0.45 * Math.min(1, dur(inst) / (3 * o.dwellMs));
    return { word, t, target: toTarget(inst), confidence: outside ? conf * 0.3 : conf, mode: "dwell" };
  }

  const held = runs.filter((r) => r.targetId && dur(r) >= o.dwellMs);
  const past = held.filter((r) => r.start <= t && r !== inst).sort((a, b) => b.end - a.end)[0];
  const future = held.filter((r) => r.start > t).sort((a, b) => a.start - b.start)[0];
  // if the instantaneous run is itself held but we are sweeping, it is a candidate "past"
  const pastC = past ?? (inst?.targetId && dur(inst) >= o.dwellMs ? inst : undefined);
  const gapPast = pastC ? Math.max(0, t - pastC.end) : Infinity;
  const gapFuture = future ? future.start - t : Infinity;

  if (pastC || future) {
    const usePast = gapPast < gapFuture;
    const r = usePast ? pastC! : future!;
    const gap = Math.min(gapPast, gapFuture);
    const other = usePast ? gapFuture : gapPast;
    let conf = 0.5 * Math.exp(-gap / o.windowMs);
    if (Number.isFinite(other) && other < gap * 2 + 50) conf *= 0.7; // ambiguous
    return {
      word,
      t,
      target: toTarget(r),
      confidence: Math.max(0.05, conf),
      mode: usePast ? "recent" : "approaching",
    };
  }
  if (inst?.targetId) {
    return { word, t, target: toTarget(inst), confidence: 0.15, mode: "sweep" };
  }
  return none(t);
}

/**
 * Bind every deictic word to the pointer target at (word.start - lagMs), weighting by dwell.
 * Each deictic in a multi-deictic utterance ("move this here") binds independently at its own time.
 */
export function resolveDeixis(
  words: readonly TimedWord[],
  pointers: TimeRing<TimedPointer>,
  opts: ResolveOpts = {},
): DeixisBinding[] {
  const o: Required<ResolveOpts> = {
    lagMs: opts.lagMs ?? 0,
    dwellMs: opts.dwellMs ?? 120,
    windowMs: opts.windowMs ?? 500,
    fastPxPerMs: opts.fastPxPerMs ?? 1.2,
    maxGapMs: opts.maxGapMs ?? 250,
  };
  const out: DeixisBinding[] = [];
  for (const w of words) if (isDeictic(w)) out.push(bindOne(pointers, w, o));
  return out;
}
