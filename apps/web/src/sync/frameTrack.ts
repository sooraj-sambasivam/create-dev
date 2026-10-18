import { TimeRing, type TimedFrame } from "@create/shared";
import type { SyncClock } from "./clock";

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lightweight snapshot of the screen state around a target at bind time. */
export interface FrameSnapshot {
  targetId?: string;
  label?: string;
  rect?: FrameRect;
  /** Optional opaque canvas-crop reference (ImageBitmap, blob URL, ...). Produced by `cropper`. */
  crop?: unknown;
  /** Pointer position at capture. */
  x?: number;
  y?: number;
}

export interface FrameTrackDeps {
  clock: SyncClock;
  /** Element rect lookup by target id. */
  rectOf?: (targetId: string) => FrameRect | undefined | null;
  /** Optional crop producer; failures are swallowed. */
  cropper?: (rect: FrameRect) => unknown;
  capacity?: number;
  windowMs?: number;
}

export interface FrameTrack {
  ring: TimeRing<TimedFrame<FrameSnapshot>>;
  capture(info: { targetId?: string; label?: string; x?: number; y?: number }, t?: number): TimedFrame<FrameSnapshot>;
  /** Frame nearest in time to t, optionally only within toleranceMs. */
  at(t: number, toleranceMs?: number): TimedFrame<FrameSnapshot> | undefined;
  /** Latest frame at or before t for a specific target. */
  forTarget(targetId: string, t: number): TimedFrame<FrameSnapshot> | undefined;
}

export function createFrameTrack(deps: FrameTrackDeps): FrameTrack {
  const windowMs = deps.windowMs ?? 15_000;
  const ring = new TimeRing<TimedFrame<FrameSnapshot>>(deps.capacity ?? 600, windowMs);
  return {
    ring,
    capture(info, t = deps.clock.now()) {
      let rect: FrameRect | undefined;
      let crop: unknown;
      try {
        rect = (info.targetId && deps.rectOf?.(info.targetId)) || undefined;
        if (rect && deps.cropper) crop = deps.cropper(rect);
      } catch {
        /* snapshots are best effort */
      }
      return ring.push({ t, ref: { ...info, rect, crop } });
    },
    at(t, tol) {
      const f = ring.nearest(t);
      if (!f) return undefined;
      return tol === undefined || Math.abs(f.t - t) <= tol ? f : undefined;
    },
    forTarget(targetId, t) {
      for (let i = ring.atOrBefore(t); i >= 0; i--) {
        const f = ring.get(i);
        if (f.ref.targetId === targetId) return f;
      }
      return undefined;
    },
  };
}
