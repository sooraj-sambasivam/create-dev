import { TimeRing, type TimedPointer } from "@create/shared";
import type { SyncClock } from "./clock";

export interface PointerTarget {
  targetId?: string;
  label?: string;
}
/** Maps viewport coordinates to a stable target identity (e.g. data-target / elementFromPoint). */
export type TargetResolver = (x: number, y: number) => PointerTarget | undefined | null;

export interface PointerTrackDeps {
  clock: SyncClock;
  resolver?: TargetResolver;
  /** Event source; default window. */
  events?: {
    addEventListener(type: string, fn: (e: any) => void, opts?: any): void;
    removeEventListener(type: string, fn: (e: any) => void, opts?: any): void;
  };
  raf?: (cb: (t: number) => void) => number;
  caf?: (id: number) => void;
  /** Target sampling rate for the rAF keep-alive. Default 120. */
  hz?: number;
  /** Ring retention. Default 15 s. */
  windowMs?: number;
  onTargetChange?: (p: TimedPointer) => void;
}

export interface PointerTrack {
  ring: TimeRing<TimedPointer>;
  start(): void;
  stop(): void;
  /** Feed a sample directly (tests, extension/notch relays). t defaults to now. */
  ingest(x: number, y: number, t?: number): TimedPointer;
  readonly running: boolean;
}

export function createPointerTrack(deps: PointerTrackDeps): PointerTrack {
  const hz = deps.hz ?? 120;
  const windowMs = deps.windowMs ?? 15_000;
  const ring = new TimeRing<TimedPointer>(Math.ceil((windowMs / 1000) * Math.max(hz, 120) * 1.25), windowMs);
  let running = false;
  let rafId: number | null = null;
  let lastX = NaN;
  let lastY = NaN;
  let lastTarget: string | undefined;
  const minGap = 1000 / hz;
  const evTarget = () => deps.events ?? (globalThis as any).window;

  function ingest(x: number, y: number, t = deps.clock.now()): TimedPointer {
    const r = deps.resolver?.(x, y) ?? undefined;
    const p = ring.push({ t, x, y, targetId: r?.targetId, label: r?.label });
    lastX = x;
    lastY = y;
    if (p.targetId !== lastTarget) {
      lastTarget = p.targetId;
      deps.onTargetChange?.(p);
    }
    return p;
  }

  const onMove = (e: any) => {
    const list: any[] = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    if (list.length) for (const c of list) ingest(c.clientX, c.clientY, c.timeStamp);
    else ingest(e.clientX, e.clientY, e.timeStamp ?? deps.clock.now());
  };

  const tick = () => {
    if (!running) return;
    const last = ring.last();
    const now = deps.clock.now();
    // keep-alive: hold position so dwell is continuous even with no events
    if (last && Number.isFinite(lastX) && now - last.t >= minGap) ingest(lastX, lastY, now);
    rafId = (deps.raf ?? requestAnimationFrame)(tick);
  };

  return {
    ring,
    get running() {
      return running;
    },
    ingest,
    start() {
      if (running) return;
      running = true;
      const et = evTarget();
      et?.addEventListener("pointermove", onMove, { passive: true });
      et?.addEventListener("pointerdown", onMove, { passive: true });
      if (deps.raf || typeof requestAnimationFrame !== "undefined") rafId = (deps.raf ?? requestAnimationFrame)(tick);
    },
    stop() {
      if (!running) return;
      running = false;
      const et = evTarget();
      et?.removeEventListener("pointermove", onMove);
      et?.removeEventListener("pointerdown", onMove);
      if (rafId !== null) (deps.caf ?? (typeof cancelAnimationFrame !== "undefined" ? cancelAnimationFrame : () => {}))(rafId);
      rafId = null;
    },
  };
}

/** Default DOM resolver: nearest ancestor with data-target-id / id, label from aria-label/text. */
export function domTargetResolver(doc: Document = document): TargetResolver {
  return (x, y) => {
    const el = doc.elementFromPoint(x, y)?.closest<HTMLElement>("[data-target-id],[data-testid],[id],button,a,[role=button]");
    if (!el) return undefined;
    const id =
      el.dataset.targetId ?? el.dataset.testid ?? (el.id || undefined) ?? `${el.tagName.toLowerCase()}:${el.textContent?.trim().slice(0, 24) ?? ""}`;
    const label = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 60) ?? undefined;
    return { targetId: id, label: label || undefined };
  };
}
