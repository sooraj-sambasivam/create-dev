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

type Listener = () => void;

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
  private cancelMove: (() => void) | null = null;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getState = (): GhostState => this.state;

  private set(patch: Partial<GhostState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
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
