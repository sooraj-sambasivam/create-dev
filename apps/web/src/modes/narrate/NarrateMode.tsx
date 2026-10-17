import { useEffect, useState } from "react";
import type { NarrationSession } from "@create/shared";
import { useScreenStore } from "../../store/screenStore";
import { resetCanvasNarrate } from "../canvas/canvasStore";
import { exitNarrate, type NarrateExitKind } from "../../narrate/exit";
import { NarrateOverlay } from "./overlay/NarrateOverlay";
import { getCanvasState } from "./overlay/canvasBridge";
import { GeneratingDemo } from "./demo/GeneratingDemo";
import { narrateEntry } from "./handoff";

const deps = {
  reset: resetCanvasNarrate,
  setMode: (m: "text" | "canvas") => useScreenStore.getState().setMode(m),
};

/** Narrate mode (page only): countdown, record (speech + lasso), then hand the session to GeneratingDemo. */
export function NarrateMode() {
  const [session, setSession] = useState<NarrationSession | null>(null);
  // Fixed for the lifetime of this run. Canvas narration lives in the canvas app now.
  const [entry] = useState(() => narrateEntry(getCanvasState().narrateFromCanvas));
  const exit = (kind: NarrateExitKind = "close") => exitNarrate("page", deps, kind);

  // A stale canvas hand-off goes straight back to the canvas, so the canvas is never left hidden.
  useEffect(() => {
    if (entry === "return-to-canvas") exitNarrate("canvas", deps, "close");
  }, [entry]);

  // Mode switched away by something else (e.g. the switcher): still release the canvas hand-off.
  // Guarded on mode so a StrictMode mount/unmount/mount cycle does not clear it mid-run.
  useEffect(
    () => () => {
      if (useScreenStore.getState().mode !== "narrate") resetCanvasNarrate();
    },
    [],
  );

  if (entry === "return-to-canvas") return null;
  if (session) {
    return <GeneratingDemo session={session} onDone={(opened) => exit(opened ?? "output")} onClose={() => exit("close")} />;
  }
  return <NarrateOverlay onFinish={setSession} onCancel={() => exit("close")} />;
}
