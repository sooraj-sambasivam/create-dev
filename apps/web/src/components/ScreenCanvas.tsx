import { AnimatePresence, motion } from "motion/react";
import { useScreenStore } from "../store/screenStore";
import { ScreenRenderer } from "./ScreenRenderer";
import { AddMenu } from "../editor/AddMenu";
import { RedoIcon, UndoIcon } from "../editor/icons";

function EditorToolbar() {
  const editMode = useScreenStore((s) => s.editMode);
  const setEditMode = useScreenStore((s) => s.setEditMode);
  const canUndo = useScreenStore((s) => s.past.length > 0);
  const canRedo = useScreenStore((s) => s.future.length > 0);
  const undo = useScreenStore((s) => s.undo);
  const redo = useScreenStore((s) => s.redo);
  const iconBtn = "rounded-md p-1.5 text-neutral-300 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="ml-auto flex items-center gap-1.5">
      {editMode && (
        <>
          <button type="button" title="Undo (⌘Z)" className={iconBtn} disabled={!canUndo} onClick={undo}>
            <UndoIcon />
          </button>
          <button type="button" title="Redo (⌘⇧Z)" className={iconBtn} disabled={!canRedo} onClick={redo}>
            <RedoIcon />
          </button>
          <AddMenu />
        </>
      )}
      <div className="ml-1 flex rounded-md border border-white/10 p-0.5 text-xs">
        {(["edit", "preview"] as const).map((m) => {
          const active = (m === "edit") === editMode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setEditMode(m === "edit")}
              className={`rounded px-2 py-0.5 capitalize transition ${active ? "bg-white/15 text-white" : "text-neutral-400 hover:text-white"}`}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="shimmer h-10 w-full rounded-lg" />
      <div className="flex gap-6">
        <div className="flex flex-1 flex-col gap-3">
          <div className="shimmer h-12 w-3/4 rounded-lg" />
          <div className="shimmer h-4 w-full rounded" />
          <div className="shimmer h-4 w-5/6 rounded" />
          <div className="shimmer mt-2 h-10 w-40 rounded-lg" />
        </div>
        <div className="shimmer aspect-video flex-1 rounded-xl" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="shimmer h-28 rounded-xl" />
        <div className="shimmer h-28 rounded-xl" />
        <div className="shimmer h-28 rounded-xl" />
      </div>
    </div>
  );
}

export function ScreenCanvas() {
  const screen = useScreenStore((s) => s.screen);
  const status = useScreenStore((s) => s.status);
  const loading = status === "loading";
  const editMode = useScreenStore((s) => s.editMode);
  const select = useScreenStore((s) => s.select);

  return (
    <motion.section
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/60 shadow-2xl shadow-black/40 backdrop-blur"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 truncate text-xs text-neutral-400">{screen?.title ?? "Generating…"}</span>
        <AnimatePresence>
          {loading && screen && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="ml-3 flex items-center gap-2 text-xs text-indigo-300"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
              Updating
            </motion.span>
          )}
        </AnimatePresence>
        {screen && <EditorToolbar />}
      </div>

      <div className="relative flex flex-1 flex-col overflow-auto" onClick={() => select(null)}>
        {screen ? <ScreenRenderer screen={screen} editable={editMode && !loading} /> : <Skeleton />}
        <AnimatePresence>
          {loading && screen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 bg-neutral-950/30"
            />
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 6, ease: "easeOut" }}
            className="absolute left-0 top-0 h-0.5 w-full origin-left bg-gradient-to-r from-indigo-400 to-pink-400"
          />
        )}
      </AnimatePresence>
    </motion.section>
  );
}
