import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RightPanelTab = "output" | "inspect" | "backend";
export const RIGHT_PANEL_TABS: readonly RightPanelTab[] = ["output", "inspect", "backend"];

export const RIGHT_PANEL_MIN_WIDTH = 280;
/** Output defaults to 440px; Inspect and Backend (context tabs) to 320px. */
export const RIGHT_PANEL_DEFAULT_WIDTH = 440;
export const RIGHT_PANEL_CONTEXT_WIDTH = 320;
export const RIGHT_PANEL_MAX_FRACTION = 0.5;
export const RIGHT_PANEL_STORAGE_KEY = "create-right-panel";

const viewportWidth = () => (typeof window === "undefined" ? 1280 : window.innerWidth);

/** Output has its own remembered width; Inspect and Backend share another. */
export type PanelWidthClass = "output" | "context";
export const widthClassOf = (tab: RightPanelTab): PanelWidthClass => (tab === "output" ? "output" : "context");

/** Upper bound: half the viewport, never below the minimum. */
export function maxRightPanelWidth(viewport = viewportWidth()): number {
  return Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(viewport * RIGHT_PANEL_MAX_FRACTION));
}

/** The default for a width class, within min..max. */
export function defaultRightPanelWidth(viewport = viewportWidth(), cls: PanelWidthClass = "output"): number {
  const want = cls === "output" ? RIGHT_PANEL_DEFAULT_WIDTH : RIGHT_PANEL_CONTEXT_WIDTH;
  return Math.min(maxRightPanelWidth(viewport), Math.max(RIGHT_PANEL_MIN_WIDTH, want));
}

export function clampRightPanelWidth(w: number, viewport?: number, cls: PanelWidthClass = "output"): number {
  if (!Number.isFinite(w)) return defaultRightPanelWidth(viewport, cls);
  return Math.min(maxRightPanelWidth(viewport), Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(w)));
}

const isTab = (v: unknown): v is RightPanelTab => typeof v === "string" && (RIGHT_PANEL_TABS as readonly string[]).includes(v);

export interface RightPanelState {
  open: boolean;
  tab: RightPanelTab;
  /** Wanted Output width in px (clamped to min..max). The layout may paint it narrower when space is short. */
  width: number;
  /** Wanted width of the context tabs (Inspect, Backend). */
  contextWidth: number;
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
  /** Back to the default for the active tab class. */
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
      width: defaultRightPanelWidth(undefined, "output"),
      contextWidth: defaultRightPanelWidth(undefined, "context"),
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
      setWidth: (w) => {
        const cls = widthClassOf(get().tab);
        if (cls === "output") set({ width: clampRightPanelWidth(w, undefined, cls) });
        else set({ contextWidth: clampRightPanelWidth(w, undefined, cls) });
      },
      reset: () => {
        const cls = widthClassOf(get().tab);
        if (cls === "output") set({ width: defaultRightPanelWidth(undefined, cls) });
        else set({ contextWidth: defaultRightPanelWidth(undefined, cls) });
      },
      setDragging: (dragging) => set({ dragging }),
      editModeOff: () => {
        if (get().tab === "inspect") set({ tab: "output" });
      },
    }),
    {
      name: RIGHT_PANEL_STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ open: s.open, tab: s.tab, width: s.width, contextWidth: s.contextWidth }),
      // Earlier versions stored half-viewport widths; drop them so the 440 / 320 defaults apply.
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
          width: typeof p.width === "number" ? clampRightPanelWidth(p.width, undefined, "output") : current.width,
          contextWidth: typeof p.contextWidth === "number" ? clampRightPanelWidth(p.contextWidth, undefined, "context") : current.contextWidth,
        };
      },
    },
  ),
);

/** The wanted width for the visible tab: Output has its own, Inspect and Backend share one. */
export const selectPanelWidth = (s: Pick<RightPanelState, "tab" | "width" | "contextWidth">): number =>
  widthClassOf(s.tab) === "output" ? s.width : s.contextWidth;

/** Header menu button state: the panel is open, on any tab. */
export const selectOutputOpen = (s: Pick<RightPanelState, "open" | "tab">): boolean => s.open;

/** The main card (thread + composer) never gets narrower than this. */
export const LAYOUT_CARD_MIN = 520;
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
