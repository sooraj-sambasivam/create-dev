import { create } from "zustand";
import type { Editor } from "tldraw";

interface CanvasState {
  /** The live tldraw editor while Canvas mode is mounted, else null. */
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
  /** True when Narrate was opened from the canvas, so it can resolve tldraw shapes. */
  narrateFromCanvas: boolean;
  setNarrateFromCanvas: (on: boolean) => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  editor: null,
  setEditor: (editor) => set({ editor }),
  narrateFromCanvas: false,
  setNarrateFromCanvas: (narrateFromCanvas) => set({ narrateFromCanvas }),
}));

/**
 * Narrate-from-canvas contract (for the integrator):
 * - Render <CanvasHost/> whenever mode === "canvas", OR mode === "narrate" && narrateFromCanvas.
 *   While narrating it keeps the tldraw editor mounted (hidden, non-interactive) so lasso can
 *   resolve canvas shapes via useCanvasStore.getState().editor.
 * - CanvasMode's unmount does not clear `editor` while narrateFromCanvas is true.
 * - Narrate must call resetCanvasNarrate() on exit; once the host unmounts the editor is cleared.
 */
export function resetCanvasNarrate(): void {
  useCanvasStore.getState().setNarrateFromCanvas(false);
  // If the host is already gone (unmounted while the flag was set), drop the stale editor.
  if (!document.querySelector("[data-canvas-host]")) useCanvasStore.getState().setEditor(null);
}
