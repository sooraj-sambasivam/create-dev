/**
 * Exit logic for Narrate mode. Every exit path (cancel, Esc, GeneratingDemo close / open page /
 * open in output) goes through exitNarrate so the canvas hand-off flag is always cleared and the
 * user lands back where they started.
 */

export type NarrateOrigin = "page" | "canvas";
/** What the user did on the way out: opened the generated page, or anything else (close, output). */
export type NarrateExitKind = "page" | "output" | "close";
export type NarrateDestination = "text" | "canvas";

export type ExitDeps = {
  /** Clears canvasStore.narrateFromCanvas (resetCanvasNarrate). */
  reset: () => void;
  setMode: (mode: NarrateDestination) => void;
};

/** "Open page" always shows the generated page (text mode); every other exit returns to the origin. */
export function exitDestination(origin: NarrateOrigin, kind: NarrateExitKind = "close"): NarrateDestination {
  if (kind === "page") return "text";
  return origin === "canvas" ? "canvas" : "text";
}

/** Resets the canvas hand-off first (so the host can unmount or stay), then switches mode. */
export function exitNarrate(origin: NarrateOrigin, deps: ExitDeps, kind: NarrateExitKind = "close"): NarrateDestination {
  const dest = exitDestination(origin, kind);
  deps.reset();
  deps.setMode(dest);
  return dest;
}
