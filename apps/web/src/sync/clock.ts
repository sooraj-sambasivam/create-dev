/**
 * Single monotonic clock for the whole sync stack: performance.now() milliseconds.
 * Everything else (pointer events, audio time, remote epoch stamps) maps INTO this.
 */
export interface SyncClock {
  /** ms, monotonic. */
  now(): number;
  /** performance.timeOrigin + now(), epoch ms. */
  epochNow(): number;
  /** Map a BaseAudioContext time (seconds) to the clock using getOutputTimestamp(). */
  fromAudioContextTime(ctx: AudioClockSource, contextTimeSec: number): number;
  /** Map an epoch ms stamp (e.g. from the extension or notch) to the clock. */
  fromEpoch(epochMs: number): number;
  toEpoch(t: number): number;
  /** Map a remote monotonic stamp (seconds, CACurrentMediaTime) given one handshake pair. */
  remoteMonotonic(handshake: { remoteSec: number; localMs: number }): (remoteSec: number) => number;
}

export interface AudioClockSource {
  getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
  currentTime: number;
}

export interface ClockDeps {
  now?: () => number;
  timeOrigin?: number;
}

export function createClock(deps: ClockDeps = {}): SyncClock {
  const now = deps.now ?? (() => performance.now());
  const origin = deps.timeOrigin ?? (typeof performance !== "undefined" ? performance.timeOrigin : Date.now() - now());
  return {
    now,
    epochNow: () => origin + now(),
    fromAudioContextTime(ctx, c) {
      const ts = ctx.getOutputTimestamp?.();
      if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
        return ts.performanceTime + (c - ts.contextTime) * 1000;
      }
      // Fallback: assume ctx.currentTime corresponds to "now".
      return now() + (c - ctx.currentTime) * 1000;
    },
    fromEpoch: (e) => e - origin,
    toEpoch: (t) => t + origin,
    remoteMonotonic({ remoteSec, localMs }) {
      const offset = localMs - remoteSec * 1000;
      return (s) => s * 1000 + offset;
    },
  };
}

/** Deterministic clock for tests. */
export function createManualClock(start = 0, origin = 1_700_000_000_000) {
  let t = start;
  const clock = createClock({ now: () => t, timeOrigin: origin });
  return Object.assign(clock, {
    set(v: number) {
      t = v;
    },
    advance(d: number) {
      t += d;
    },
  });
}
export type ManualClock = ReturnType<typeof createManualClock>;
