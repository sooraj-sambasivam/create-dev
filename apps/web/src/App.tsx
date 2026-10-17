import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useScreenStore } from "./store/screenStore";
import { ModeSwitcher } from "./components/ModeSwitcher";
import { ScreenCanvas } from "./components/ScreenCanvas";
import { TextMode } from "./modes/text/TextMode";
import { VoiceMode } from "./modes/voice/VoiceMode";
import { CanvasMode } from "./modes/canvas/CanvasMode";
import { NarrateMode } from "./modes/narrate/NarrateMode";
import { Inspector } from "./editor/Inspector";
import { useEditorShortcuts } from "./editor/useShortcuts";

function ActiveMode() {
  const mode = useScreenStore((s) => s.mode);
  switch (mode) {
    case "text":
      return <TextMode />;
    case "voice":
      return <VoiceMode />;
    case "canvas":
      return <CanvasMode />;
    case "narrate":
      return <NarrateMode />;
  }
}

export default function App() {
  const screen = useScreenStore((s) => s.screen);
  const status = useScreenStore((s) => s.status);
  const error = useScreenStore((s) => s.error);
  const history = useScreenStore((s) => s.history);
  const reset = useScreenStore((s) => s.reset);
  const editMode = useScreenStore((s) => s.editMode);
  const lastSummary = useScreenStore((s) => s.lastSummary);
  const dismissSummary = useScreenStore((s) => s.dismissSummary);
  useEditorShortcuts();
  const [confirmReset, setConfirmReset] = useState(false);

  // Open at the top of the page after a reload, not wherever the browser last was.
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  const docked = screen !== null || status === "loading";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-lg bg-gradient-to-br from-indigo-400 to-pink-400" />
          <span className="text-sm font-semibold tracking-wide text-neutral-200">Create</span>
        </div>
        <ModeSwitcher />
        <button
          type="button"
          onClick={() => {
            if (confirmReset) {
              setConfirmReset(false);
              reset();
            } else setConfirmReset(true);
          }}
          disabled={!screen}
          className={`rounded-md px-2 py-1 text-sm transition disabled:opacity-0 ${
            confirmReset ? "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30" : "text-neutral-400 hover:text-white"
          }`}
        >
          {confirmReset ? "Delete this page? Click again" : "Start over"}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-6">
        <AnimatePresence mode="popLayout">
          {!docked && (
            <motion.div
              key="hero"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16, transition: { duration: 0.2 } }}
              className="flex flex-1 flex-col items-center justify-end pb-8 text-center"
            >
              <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">What do you want to build?</h1>
              <p className="mt-3 max-w-xl text-balance text-neutral-400">
                Type it, say it, or draw it. A real interface appears, and you can keep refining it in plain language.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {docked && (
          <div className="flex flex-1 flex-col gap-4 md:flex-row">
            <ScreenCanvas />
            {editMode && screen && <Inspector />}
          </div>
        )}

        <motion.div
          layout
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className={docked ? "mx-auto mt-4 w-full max-w-3xl" : "mx-auto flex w-full max-w-2xl flex-1 flex-col justify-start"}
        >
          <AnimatePresence>
            {history.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mb-2 flex flex-wrap items-center gap-1.5 px-1"
              >
                {history.slice(-4).map((h, i) => (
                  <span
                    key={`${i}-${h.prompt}`}
                    title={h.summary}
                    className="max-w-[16rem] truncate rounded-full border border-white/10 bg-neutral-900/60 px-2.5 py-1 text-xs text-neutral-400"
                  >
                    {h.kind === "element" ? "✦ " : ""}
                    {h.prompt}
                  </span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {lastSummary && !error && status !== "loading" && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                role="status"
                className="mb-2 flex items-start gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-100"
              >
                <span aria-hidden className="text-indigo-300">✦</span>
                <span className="flex-1">{lastSummary}</span>
                <button type="button" onClick={dismissSummary} aria-label="Dismiss" className="text-indigo-300/70 hover:text-white">
                  ×
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                role="alert"
                className="mb-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <ActiveMode />
        </motion.div>
      </main>
    </div>
  );
}
