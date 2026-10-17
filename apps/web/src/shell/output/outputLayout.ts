import { create } from "zustand";

export const OUTPUT_MIN_WIDTH = 360;
export const OUTPUT_DEFAULT_WIDTH = 480;
export const OUTPUT_MAX_FRACTION = 0.6;
export const OUTPUT_WIDTH_KEY = "create-output-width";

/** Upper bound: 60% of the viewport, never below the minimum. */
export function maxOutputWidth(viewport = typeof window === "undefined" ? 1600 : window.innerWidth): number {
  return Math.max(OUTPUT_MIN_WIDTH, Math.round(viewport * OUTPUT_MAX_FRACTION));
}

export function clampOutputWidth(w: number, viewport?: number): number {
  if (!Number.isFinite(w)) return OUTPUT_DEFAULT_WIDTH;
  return Math.min(maxOutputWidth(viewport), Math.max(OUTPUT_MIN_WIDTH, Math.round(w)));
}

function readStored(): number {
  try {
    const raw = localStorage.getItem(OUTPUT_WIDTH_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return clampOutputWidth(n);
    }
  } catch {
    /* storage unavailable */
  }
  return clampOutputWidth(OUTPUT_DEFAULT_WIDTH);
}

function persist(w: number) {
  try {
    localStorage.setItem(OUTPUT_WIDTH_KEY, String(w));
  } catch {
    /* storage unavailable */
  }
}

interface OutputLayoutState {
  /** Current pane width in px (already clamped). */
  width: number;
  setWidth: (w: number) => void;
  reset: () => void;
  /** True while the user drags the resize handle. Not persisted. */
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
}

export const useOutputLayout = create<OutputLayoutState>((set) => ({
  width: readStored(),
  dragging: false,
  setDragging: (dragging) => set({ dragging }),
  setWidth: (w) => {
    const width = clampOutputWidth(w);
    persist(width);
    set({ width });
  },
  reset: () => {
    const width = clampOutputWidth(OUTPUT_DEFAULT_WIDTH);
    persist(width);
    set({ width });
  },
}));
