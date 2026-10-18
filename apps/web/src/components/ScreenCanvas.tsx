import { AnimatePresence, motion } from "motion/react";
import { useScreenStore } from "../store/screenStore";
import { ScreenRenderer } from "./ScreenRenderer";
import { AddMenu } from "../editor/AddMenu";
import { PublishMenu } from "../editor/PublishMenu";
import { RedoIcon, UndoIcon } from "../editor/icons";

function EditorToolbar() {
  const editMode = useScreenStore((s) => s.editMode);
  const setEditMode = useScreenStore((s) => s.setEditMode);
  const canUndo = useScreenStore((s) => s.past.length > 0);
  const canRedo = useScreenStore((s) => s.future.length > 0);
  const undo = useScreenStore((s) => s.undo);
  const redo = useScreenStore((s) => s.redo);
  const iconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent";
  // Restyle the Add / Publish triggers from here: Add = ghost secondary, Publish = the one accent primary.
  const addSlot =
    "[&>div>button]:!inline-flex [&>div>button]:!h-8 [&>div>button]:!items-center [&>div>button]:!gap-1.5 [&>div>button]:!rounded-lg [&>div>button]:!bg-transparent [&>div>button]:!px-2.5 [&>div>button]:!text-sm [&>div>button]:!font-medium [&>div>button]:!text-ink-2 [&>div>button:hover]:!bg-hover [&_.absolute]:!max-h-[min(70vh,22rem)] [&_.absolute]:!w-64";
  const publishSlot =
    "[&>div>button]:!inline-flex [&>div>button]:!h-8 [&>div>button]:!items-center [&>div>button]:!rounded-lg [&>div>button]:!bg-accent [&>div>button]:!px-3 [&>div>button]:!text-sm [&>div>button]:!font-medium [&>div>button]:!text-white dark:[&>div>button]:!text-shell [&>div>button:hover]:!opacity-90 [&>div>button]:!transition-opacity";
  return (
    <div className="ml-auto flex items-center gap-1">
      {editMode && (
        <>
          <button type="button" title="Undo (⌘Z)" aria-label="Undo" className={iconBtn} disabled={!canUndo} onClick={undo}>
            <UndoIcon />
          </button>
          <button type="button" title="Redo (⌘⇧Z)" aria-label="Redo" className={iconBtn} disabled={!canRedo} onClick={redo}>
            <RedoIcon />
          </button>
          <div className={addSlot}>
            <AddMenu />
          </div>
        </>
      )}
      <div className={publishSlot}>
        <PublishMenu />
      </div>
      <div className="ml-1 flex h-8 items-center rounded-full bg-tray p-0.5 text-sm">
        {(["edit", "preview"] as const).map((m) => {
          const active = (m === "edit") === editMode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setEditMode(m === "edit")}
              className={`h-7 rounded-full px-3 transition-colors duration-150 ${active ? "bg-surface text-ink shadow-soft" : "text-ink-2 hover:text-ink"}`}
            >
              {m === "edit" ? "Edit" : "Preview"}
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
      className="relative flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface"
    >
      <div className="flex h-11 shrink-0 items-center gap-2 bg-surface px-3">
        <span className="truncate text-sm text-ink-2">{screen?.title ?? "Generating…"}</span>
        <span className="flex w-24 shrink-0 items-center gap-2 text-xs text-ink-3" aria-live="polite">
          <AnimatePresence>
            {loading && screen && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                Updating
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        {screen && <EditorToolbar />}
      </div>

      <div className="relative flex flex-1 flex-col overflow-auto border-t border-line bg-shell p-2" onClick={() => select(null)}>
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-lg ring-1 ring-line">
          {screen ? <ScreenRenderer screen={screen} editable={editMode && !loading} /> : <Skeleton />}
        </div>
        <AnimatePresence>
          {loading && screen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 bg-shell/40"
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
            className="absolute left-0 top-0 h-0.5 w-full origin-left bg-gradient-to-r from-accent to-accent"
          />
        )}
      </AnimatePresence>
    </motion.section>
  );
}
