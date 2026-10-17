/**
 * Entry decision for Narrate mode. Canvas narration now runs in the canvas app, so the main window
 * only narrates the page. A stale canvas hand-off flag never starts the lasso; it returns to canvas.
 */
export type NarrateEntry = "overlay" | "return-to-canvas";

export function narrateEntry(narrateFromCanvas: boolean | undefined): NarrateEntry {
  return narrateFromCanvas === true ? "return-to-canvas" : "overlay";
}
