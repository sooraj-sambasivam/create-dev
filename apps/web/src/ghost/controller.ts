import { glideDuration, makePath, pointAtTime, type Point } from "./path";

export interface GhostState {
  visible: boolean;
  pos: Point;
  caption: string | null;
  /** Bumped on every click so the view can replay the ripple. */
  rippleKey: number;
}

export interface GhostCursorApi {
  /** Glide (or jump, if `instant`) to a point. Resolves on arrival. */
  moveTo(p: Point, opts?: { instant?: boolean }): Promise<void>;
  ripple(): void;
  say(text: string | null): void;
  show(): void;
  hide(): void;
  getPos(): Point;
}

/** What the React view re-renders for. Position is not in it: it changes every frame and bypasses React. */
export interface GhostUiState {
  visible: boolean;
  caption: string | null;
  rippleKey: number;
}

type Listener = () => void;
type PosListener = (p: Point) => void;

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Framework-free cursor state. The React view subscribes; the script runner
 * calls the API. Position is advanced by requestAnimationFrame along the bezier
 * path (falls back to setTimeout where rAF is missing).
 */
export class GhostController implements GhostCursorApi {
  private state: GhostState = {
    visible: false,
    pos: { x: 24, y: 24 },
    caption: null,
    rippleKey: 0,
  };
  private listeners = new Set<Listener>();
  private uiListeners = new Set<Listener>();
  private posListeners = new Set<PosListener>();
  private ui: GhostUiState = { visible: false, caption: null, rippleKey: 0 };
  private cancelMove: (() => void) | null = null;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getState = (): GhostState => this.state;

  /** Fires only when visibility, caption or ripple change (never per frame). */
  subscribeUi = (l: Listener): (() => void) => {
    this.uiListeners.add(l);
    return () => this.uiListeners.delete(l);
  };

  /** Stable between changes, so useSyncExternalStore does not re-render on motion. */
  getUi = (): GhostUiState => this.ui;

  /** Per-frame position channel. The view writes the DOM transform directly from it. */
  subscribePos = (l: PosListener): (() => void) => {
    this.posListeners.add(l);
    return () => this.posListeners.delete(l);
  };

  private set(patch: Partial<GhostState>): void {
    this.state = { ...this.state, ...patch };
    const { visible, caption, rippleKey } = this.state;
    const uiChanged = visible !== this.ui.visible || caption !== this.ui.caption || rippleKey !== this.ui.rippleKey;
    if (uiChanged) this.ui = { visible, caption, rippleKey };
    this.listeners.forEach((l) => l());
    if (patch.pos) this.posListeners.forEach((l) => l(this.state.pos));
    if (uiChanged) this.uiListeners.forEach((l) => l());
  }

  getPos(): Point {
    return this.state.pos;
  }

  show(): void {
    if (!this.state.visible) this.set({ visible: true });
  }

  hide(): void {
    this.cancelMove?.();
    this.set({ visible: false, caption: null });
  }

  say(text: string | null): void {
    this.set({ caption: text });
  }

  ripple(): void {
    this.set({ rippleKey: this.state.rippleKey + 1 });
  }

  moveTo(to: Point, opts: { instant?: boolean } = {}): Promise<void> {
    this.cancelMove?.();
    this.show();
    const from = this.state.pos;
    if (opts.instant || prefersReducedMotion() || (from.x === to.x && from.y === to.y)) {
      this.set({ pos: to });
      return Promise.resolve();
    }
    const path = makePath(from, to);
    const dur = glideDuration(from, to);
    return new Promise<void>((resolve) => {
      let done = false;
      let handle: number | ReturnType<typeof setTimeout> = 0;
      const raf = typeof requestAnimationFrame === "function";
      const finish = () => {
        if (done) return;
        done = true;
        this.cancelMove = null;
        resolve();
      };
      this.cancelMove = () => {
        if (raf) cancelAnimationFrame(handle as number);
        else clearTimeout(handle as ReturnType<typeof setTimeout>);
        finish();
      };
      const t0 = now();
      const tick = () => {
        const t = Math.min(1, (now() - t0) / dur);
        this.set({ pos: pointAtTime(path, t) });
        if (t >= 1) return finish();
        handle = raf ? requestAnimationFrame(tick) : setTimeout(tick, 16);
      };
      tick();
    });
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export const ghostController = new GhostController();
