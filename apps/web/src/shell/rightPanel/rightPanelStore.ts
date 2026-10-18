import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RightPanelTab = "output" | "inspect" | "backend";
export const RIGHT_PANEL_TABS: readonly RightPanelTab[] = ["output", "inspect", "backend"];

export const RIGHT_PANEL_MIN_WIDTH = 420;
/** Fallback when the viewport is unknown. The real default is half the viewport (see defaultRightPanelWidth). */
export const RIGHT_PANEL_DEFAULT_WIDTH = 640;
export const RIGHT_PANEL_DEFAULT_FRACTION = 0.5;
export const RIGHT_PANEL_MAX_FRACTION = 0.7;
export const RIGHT_PANEL_STORAGE_KEY = "create-right-panel";

const viewportWidth = () => (typeof window === "undefined" ? 1280 : window.innerWidth);

/** Upper bound: 70% of the viewport, never below the minimum. */
export function maxRightPanelWidth(viewport = viewportWidth()): number {
  return Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(viewport * RIGHT_PANEL_MAX_FRACTION));
}

/** Half the viewport, within min..max. */
export function defaultRightPanelWidth(viewport = viewportWidth()): number {
  return Math.min(maxRightPanelWidth(viewport), Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(viewport * RIGHT_PANEL_DEFAULT_FRACTION)));
}

export function clampRightPanelWidth(w: number, viewport?: number): number {
  if (!Number.isFinite(w)) return defaultRightPanelWidth(viewport);
  return Math.min(maxRightPanelWidth(viewport), Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(w)));
}

const isTab = (v: unknown): v is RightPanelTab => typeof v === "string" && (RIGHT_PANEL_TABS as readonly string[]).includes(v);

export interface RightPanelState {
  open: boolean;
  tab: RightPanelTab;
  /** Wanted width in px (clamped to min..max). The layout may paint it narrower when space is short. */
  width: number;
  /** True while the resize handle is dragged. Not persisted. */
  dragging: boolean;

  setOpen: (open: boolean) => void;
  setTab: (tab: RightPanelTab) => void;
  /** Open the panel on a tab. */
  openTab: (tab: RightPanelTab) => void;
  close: () => void;
  /** Header menu button: closed opens Output; open on any tab closes. */
  toggleOutput: () => void;
  /** Generation started or a page appeared: show Output (never closes, keeps the width). */
  showOutput: () => void;
  setWidth: (w: number) => void;
  /** Back to the default: half the viewport. */
  reset: () => void;
  setDragging: (dragging: boolean) => void;
  /** Edit mode was turned off: Inspect has nothing to show, so fall back to Output. */
  editModeOff: () => void;
}

export const useRightPanel = create<RightPanelState>()(
  persist(
    (set, get) => ({
      open: false,
      tab: "output",
      width: defaultRightPanelWidth(),
      dragging: false,

      setOpen: (open) => set({ open }),
      setTab: (tab) => set({ tab }),
      openTab: (tab) => set({ open: true, tab }),
      close: () => set({ open: false }),
      toggleOutput: () => {
        if (get().open) set({ open: false });
        else set({ open: true, tab: "output" });
      },
      showOutput: () => set({ open: true, tab: "output" }),
      setWidth: (w) => set({ width: clampRightPanelWidth(w) }),
      reset: () => set({ width: defaultRightPanelWidth() }),
      setDragging: (dragging) => set({ dragging }),
      editModeOff: () => {
        if (get().tab === "inspect") set({ tab: "output" });
      },
    }),
    {
      name: RIGHT_PANEL_STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ open: s.open, tab: s.tab, width: s.width }),
      // v1 stored a 400px default; drop it so the new half-viewport default applies.
      migrate: (persisted) => {
        const p = (persisted && typeof persisted === "object" ? persisted : {}) as Record<string, unknown>;
        return { open: p.open, tab: p.tab } as unknown as RightPanelState;
      },
      merge: (persisted, current) => {
        const p = (persisted && typeof persisted === "object" ? persisted : {}) as Record<string, unknown>;
        return {
          ...current,
          open: p.open === true,
          tab: isTab(p.tab) ? p.tab : current.tab,
          width: typeof p.width === "number" ? clampRightPanelWidth(p.width) : current.width,
        };
      },
    },
  ),
);

/** Header menu button state: the panel is open, on any tab. */
export const selectOutputOpen = (s: Pick<RightPanelState, "open" | "tab">): boolean => s.open;

/** The main card (thread + composer) never gets narrower than this. */
export const LAYOUT_CARD_MIN = 440;
const CARD_GUTTER = 8;
const PANEL_GUTTER = 8;

/**
 * Sidebar | card | panel, all in flow. The card keeps LAYOUT_CARD_MIN. When the wanted panel width
 * does not fit beside the expanded sidebar, the sidebar drops to its rail first; then the panel is
 * capped to what is left. The panel never goes below its own minimum.
 */
export function planRightPanelLayout(opts: {
  rowWidth: number;
  sidebarWidth: number;
  sidebarRail: number;
  panelWidth: number;
  open: boolean;
  cardMin?: number;
}): { collapseSidebar: boolean; panelWidth: number } {
  const { rowWidth, sidebarWidth, sidebarRail, panelWidth, open, cardMin = LAYOUT_CARD_MIN } = opts;
  if (!open) return { collapseSidebar: false, panelWidth: 0 };
  if (rowWidth <= 0) return { collapseSidebar: false, panelWidth };
  const room = (sb: number) => rowWidth - sb - CARD_GUTTER - cardMin - PANEL_GUTTER;
  const wanted = Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(panelWidth, maxRightPanelWidth(rowWidth)));
  const collapseSidebar = room(sidebarWidth) < wanted;
  const available = room(collapseSidebar ? sidebarRail : sidebarWidth);
  return { collapseSidebar, panelWidth: Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(wanted, available)) };
}
