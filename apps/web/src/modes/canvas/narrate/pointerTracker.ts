import { clientToLocal, isInsideBox, type Pt } from "./geometry";

export type TrackerBox = { left: number; top: number; width: number; height: number };

export type PointerInfo = {
  clientX: number;
  clientY: number;
  /** Position relative to the tracked container. */
  local: Pt;
  /** The pointer is inside the container and not over one of our own interactive pills. */
  inside: boolean;
};

export type PointerTrackerOptions = {
  /** Where capture listeners go. The window in the app; any EventTarget in tests. */
  target: EventTarget;
  /** The tldraw container's current rect. */
  getBox: () => TrackerBox;
  /** True when the event target is one of our own interactive elements (pills, buttons). */
  isUi?: (t: EventTarget | null) => boolean;
  /** Shift+drag lasso is enabled (only while recording). */
  lassoEnabled: () => boolean;
  onMove: (info: PointerInfo) => void;
  onLeave: () => void;
  onLassoStart?: (start: PointerInfo) => void;
  onLassoMove?: (start: PointerInfo, now: PointerInfo) => void;
  /** `cancelled` is true for pointercancel. */
  onLassoEnd?: (start: PointerInfo, end: PointerInfo, cancelled: boolean) => void;
};

/**
 * Capture-phase pointer tracking for the Narrate overlay. The overlay itself is pointer-events-none, so it
 * never receives events; listening on the window in the capture phase sees every event before tldraw does and
 * lets a Shift+drag lasso swallow the gesture so tldraw's own brush never starts.
 */
export function attachPointerTracker(o: PointerTrackerOptions): () => void {
  const info = (e: PointerEvent, ui = false): PointerInfo => {
    const box = o.getBox();
    return {
      clientX: e.clientX,
      clientY: e.clientY,
      local: clientToLocal(box, e.clientX, e.clientY),
      inside: !ui && isInsideBox(box, e.clientX, e.clientY),
    };
  };
  let lasso: PointerInfo | null = null;

  const onMove = (ev: Event) => {
    const e = ev as PointerEvent;
    const cur = info(e, o.isUi?.(e.target) ?? false);
    if (lasso) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      o.onLassoMove?.(lasso, info(e));
    }
    if (cur.inside || lasso) o.onMove(cur);
    else o.onLeave();
  };
  const onDown = (ev: Event) => {
    const e = ev as PointerEvent;
    if (!o.lassoEnabled() || !e.shiftKey || e.button !== 0) return;
    if (o.isUi?.(e.target)) return;
    const cur = info(e);
    if (!cur.inside) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    lasso = cur;
    o.onLassoStart?.(cur);
  };
  const finish = (ev: Event, cancelled: boolean) => {
    if (!lasso) return;
    const e = ev as PointerEvent;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const start = lasso;
    lasso = null;
    o.onLassoEnd?.(start, info(e), cancelled);
  };
  const onUp = (ev: Event) => finish(ev, false);
  const onCancel = (ev: Event) => finish(ev, true);
  const onDocLeave = () => {
    if (!lasso) o.onLeave();
  };

  o.target.addEventListener("pointermove", onMove, true);
  o.target.addEventListener("pointerdown", onDown, true);
  o.target.addEventListener("pointerup", onUp, true);
  o.target.addEventListener("pointercancel", onCancel, true);
  o.target.addEventListener("blur", onDocLeave);
  return () => {
    o.target.removeEventListener("pointermove", onMove, true);
    o.target.removeEventListener("pointerdown", onDown, true);
    o.target.removeEventListener("pointerup", onUp, true);
    o.target.removeEventListener("pointercancel", onCancel, true);
    o.target.removeEventListener("blur", onDocLeave);
  };
}
