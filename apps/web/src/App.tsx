import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { useScreenStore } from "./store/screenStore";
import { ScreenCanvas } from "./components/ScreenCanvas";
import { CanvasHost } from "./modes/canvas/CanvasMode";
import { NarrateMode } from "./modes/narrate/NarrateMode";
import { Inspector } from "./editor/Inspector";
import { useEditorShortcuts } from "./editor/useShortcuts";
import { AppShell } from "./shell/AppShell";
import { Composer } from "./shell/composer";
import { SharedView } from "./share/SharedView";
import { sharedIdFromLocation } from "./share/route";
import { useWorkspaceStore } from "./store/workspaceStore";
import { setDemoWorkspaceBridge } from "./modes/narrate/demo/workspaceBridge";

setDemoWorkspaceBridge({
  logDemo: (e) => useWorkspaceStore.getState().log("demo", `${e.title}${e.mock ? " (mock)" : ""}: ${e.summary}`),
  isOutputOpen: () => useWorkspaceStore.getState().outputOpen,
  toggleOutput: () => useWorkspaceStore.getState().toggleOutput(),
});

function Toasts() {
  const error = useScreenStore((s) => s.error);
  const status = useScreenStore((s) => s.status);
  const lastSummary = useScreenStore((s) => s.lastSummary);
  const dismissSummary = useScreenStore((s) => s.dismissSummary);
  return (
    <div className="px-4">
      <AnimatePresence>
        {lastSummary && !error && status !== "loading" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
            className="mx-auto mb-2 flex max-w-[740px] items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[14px] text-ink-2 shadow-soft"
          >
            <Sparkles size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 text-accent" />
            <span className="flex-1">{lastSummary}</span>
            <button type="button" onClick={dismissSummary} aria-label="Dismiss" className="text-ink-3 hover:text-ink">
              <X size={16} strokeWidth={1.75} />
            </button>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            className="mx-auto mb-2 max-w-[740px] rounded-xl border border-line bg-surface px-3 py-2 text-[14px] text-bad shadow-soft"
          >
            ✕ {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Builder() {
  const screen = useScreenStore((s) => s.screen);
  const status = useScreenStore((s) => s.status);
  const mode = useScreenStore((s) => s.mode);
  const editMode = useScreenStore((s) => s.editMode);
  const setMode = useScreenStore((s) => s.setMode);
  useEditorShortcuts();

  // Voice is recorded inside the composer (the fan's Mic); never leave the app in a standalone "voice" mode.
  useEffect(() => {
    if (mode === "voice") setMode("text");
  }, [mode, setMode]);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);

  const docked = screen !== null || status === "loading";

  return (
    <AppShell>
      {docked ? (
        <div className="flex min-h-0 flex-1 gap-4 overflow-auto px-4 pb-4 md:flex-row">
          <ScreenCanvas />
          {editMode && screen && <Inspector />}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-24 text-center">
          <h2 className="text-[28px] leading-9 font-normal tracking-[-0.01em] text-ink">What should we work on?</h2>
        </div>
      )}

      <div className={docked ? "mx-auto mb-6 w-full shrink-0 px-4" : "absolute inset-x-0 top-1/2 mt-2 px-4"}>
        <Toasts />
        <Composer />
      </div>

      <CanvasHost />
      {mode === "narrate" && <NarrateMode />}
    </AppShell>
  );
}

export default function App() {
  const sharedId = sharedIdFromLocation();
  if (sharedId) return <SharedView id={sharedId} />;
  return <Builder />;
}
