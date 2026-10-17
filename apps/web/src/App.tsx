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
  useEditorShortcuts();

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
          onClick={reset}
          disabled={!screen}
          className="text-sm text-neutral-400 transition hover:text-white disabled:opacity-0"
        >
          Start over
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
                    {h.prompt}
                  </span>
                ))}
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
