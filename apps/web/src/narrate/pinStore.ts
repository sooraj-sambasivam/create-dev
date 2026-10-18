import { create } from "zustand";
import type { HoverHit } from "../modes/narrate/overlay/targets";

/** The page element pinned as the pointer target by a click while narrating. It beats hover until unpinned. */
type PinState = { pinned: HoverHit | null; pin: (hit: HoverHit) => void; unpin: () => void };

export const usePin = create<PinState>((set) => ({
  pinned: null,
  pin: (pinned) => set({ pinned }),
  unpin: () => set({ pinned: null }),
}));

/** A click pins the element under it (a second click on the pinned one unpins); a click on empty space unpins. */
export function pinFromClick(hit: HoverHit | null, current: HoverHit | null): HoverHit | null {
  if (!hit) return null;
  return current?.id === hit.id ? null : hit;
}
