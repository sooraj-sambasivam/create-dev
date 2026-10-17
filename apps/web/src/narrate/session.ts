import type { NarrationEvent, NarrationSession } from "@create/shared";

/** Omit applied to each member of the NarrationEvent union (plain Omit would collapse it). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event as callers supply it: the recorder stamps `t` itself. */
export type NarrationInput = DistributiveOmit<NarrationEvent, "t">;

export type NarrationContext = NarrationSession["context"];

export type Recorder = {
  /** Live session object; the same reference is returned on every access. */
  session: NarrationSession;
  /** Appends an event stamped with ms since startedAt. Ignored after finish(). */
  add(ev: NarrationInput): void;
  /** Appends a PNG data URL snapshot. Ignored after finish() or when empty. */
  snapshot(dataUrl: string): void;
  /** Closes the session (sets endedAt once) and returns it. */
  finish(): NarrationSession;
};

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Records one narration session. `now` is injectable so tests can drive time.
 * startedAt and endedAt are epoch ms; event `t` values are ms since startedAt.
 */
export function createRecorder(context: NarrationContext, now: () => number = () => Date.now()): Recorder {
  const startedAt = now();
  const session: NarrationSession = {
    id: newId(),
    context,
    startedAt,
    events: [],
    snapshots: [],
  };
  let open = true;
  const elapsed = () => Math.max(0, now() - startedAt);

  return {
    session,
    add(ev) {
      if (!open) return;
      session.events.push({ ...ev, t: elapsed() } as NarrationEvent);
    },
    snapshot(dataUrl) {
      if (!open || !dataUrl) return;
      session.snapshots.push(dataUrl);
    },
    finish() {
      if (open) {
        open = false;
        session.endedAt = now();
      }
      return session;
    },
  };
}
