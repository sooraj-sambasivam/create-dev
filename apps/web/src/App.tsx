import { Suspense, lazy, useEffect } from "react";
import { useScreenStore } from "./store/screenStore";
import { NarrateMode } from "./modes/narrate/NarrateMode";
import { useEditorShortcuts } from "./editor/useShortcuts";
import { AppShell } from "./shell/AppShell";
import { Composer } from "./shell/composer";
import { Thread, deriveItems } from "./shell/thread";
import { EmptyState } from "./shell/EmptyState";
import { ErrorBoundary } from "./ErrorBoundary";
import { sharedIdFromLocation } from "./share/route";
import { useWorkspaceStore } from "./store/workspaceStore";
import { selectOutputOpen, useRightPanel } from "./shell/rightPanel/rightPanelStore";
import { MotionStyles } from "./motion";
import { setDemoWorkspaceBridge } from "./modes/narrate/demo/workspaceBridge";

const CanvasHost = lazy(() => import("./modes/canvas/CanvasMode").then((m) => ({ default: m.CanvasHost })));
const SharedView = lazy(() => import("./share/SharedView").then((m) => ({ default: m.SharedView })));

setDemoWorkspaceBridge({
  logDemo: (e) => useWorkspaceStore.getState().log("demo", `${e.title}${e.mock ? " (mock)" : ""}: ${e.summary}`),
  isOutputOpen: () => selectOutputOpen(useRightPanel.getState()),
  toggleOutput: () => useRightPanel.getState().toggleOutput(),
});

function Builder() {
  const status = useScreenStore((s) => s.status);
  const mode = useScreenStore((s) => s.mode);
  const setMode = useScreenStore((s) => s.setMode);
  useEditorShortcuts();

  // Voice is recorded inside the composer (the fan's Mic); never leave the app in a standalone "voice" mode.
  useEffect(() => {
    if (mode === "voice") setMode("text");
  }, [mode, setMode]);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);

  // The main card is only the conversation. The generated page lives in the right panel.
  const history = useScreenStore((s) => s.history);
  const error = useScreenStore((s) => s.error);
  const canvasWanted = mode === "canvas" || mode === "narrate";
  const docked = deriveItems({ history, status, error }).length > 0;

  return (
    <AppShell>
      {docked ? (
        <>
          <Thread />
          <div className="mx-auto mb-6 w-full shrink-0 px-4">
            <Composer />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center justify-center px-4 pb-24 text-center">
            <h2 className="text-[28px] leading-9 font-normal tracking-[-0.01em] text-ink">What should we work on?</h2>
          </div>
          <div className="absolute inset-x-0 top-1/2 mt-2 px-4">
            <Composer />
            <EmptyState />
          </div>
        </>
      )}

      <MotionStyles />
      {canvasWanted && (
        <Suspense fallback={null}>
          <CanvasHost />
        </Suspense>
      )}
      {mode === "narrate" && <NarrateMode />}
    </AppShell>
  );
}

export default function App() {
  const sharedId = sharedIdFromLocation();
  return (
    <ErrorBoundary>
      {sharedId ? (
        <Suspense fallback={null}>
          <SharedView id={sharedId} />
        </Suspense>
      ) : (
        <Builder />
      )}
    </ErrorBoundary>
  );
}
