import { useCanvasStore } from "../../canvas/canvasStore";

/** Read-only view of the canvas store fields Narrate still needs (the canvas hand-off flag). */
type CanvasState = { narrateFromCanvas?: boolean };

export function getCanvasState(): CanvasState {
  return useCanvasStore.getState() as unknown as CanvasState;
}
