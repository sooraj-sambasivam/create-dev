import { useEffect, useMemo, useRef } from "react";
import { pushSample, resolveHoverAt, sampleAt, type PointerSample } from "./targets";

export type PagePointer = {
  /** The newest sample, or null before the pointer has moved. */
  latest(): PointerSample | null;
  /** Where the pointer was at time `t` (Date.now() ms), for binding "this" at the start of an utterance. */
  resolveAt(t: number): PointerSample | null;
  /** Called once per animation frame in which the pointer moved. */
  subscribe(fn: (s: PointerSample) => void): () => void;
};

/**
 * Tracks the pointer over the page. A passive window listener (so it works under the narrate overlay),
 * rAF-throttled: each frame resolves the page node under the pointer and records it in a ring buffer.
 */
export function usePagePointer(enabled = true): PagePointer {
  const buf = useRef<PointerSample[]>([]);
  const subs = useRef(new Set<(s: PointerSample) => void>());

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let pending: { x: number; y: number } | null = null;
    const flush = () => {
      raf = 0;
      if (!pending) return;
      const { x, y } = pending;
      pending = null;
      const s: PointerSample = { t: Date.now(), x, y, hit: resolveHoverAt(x, y) };
      pushSample(buf.current, s);
      subs.current.forEach((fn) => fn(s));
    };
    const move = (e: PointerEvent) => {
      pending = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(flush);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      if (raf) cancelAnimationFrame(raf);
      buf.current = [];
    };
  }, [enabled]);

  return useMemo<PagePointer>(
    () => ({
      latest: () => buf.current[buf.current.length - 1] ?? null,
      resolveAt: (t) => sampleAt(buf.current, t),
      subscribe: (fn) => {
        subs.current.add(fn);
        return () => void subs.current.delete(fn);
      },
    }),
    [],
  );
}
