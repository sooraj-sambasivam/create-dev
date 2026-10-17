import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Sidebar, SIDEBAR_RAIL, readSidebarWidth } from "./Sidebar";
import { Header, copyShareLink, type ShareOutcome, type WorkspaceActions } from "./Header";
import { OutputPane, sharePrototype } from "./output";
import { OUTPUT_MIN_WIDTH, useOutputLayout } from "./output/outputLayout";
import { selectActiveChat, useWorkspaceStore } from "../store/workspaceStore";
import { useScreenStore } from "../store/screenStore";
import "./builder.css";

/** Output pane open/close timing. Reduced motion makes both instant. */
const PANE_MS = 220;
const PANE_EASE = "easeOut" as const;
/** Narrowest the work card is kept (view mode). The Output pane pushes the card; it never overlays it. */
const CARD_MIN_WIDTH = 640;
/** With the editor inspector (about 440 px) showing, the page canvas still needs room, so the card is kept wider. */
const CARD_MIN_WIDTH_EDIT = 900;
/** Right margin of the card (mr-2). */
const CARD_GUTTER = 8;

/**
 * How wide the Output pane can be while the card keeps `cardMin`. Pure so it can be tested.
 * `collapseSidebar` is true when even the minimum pane would not fit beside the expanded sidebar,
 * so the sidebar drops to its icon rail. The pane never goes below OUTPUT_MIN_WIDTH: past that
 * point the card is the part that gives, not the composer being covered.
 */
export function planOutputLayout(opts: {
  rowWidth: number;
  sidebarWidth: number;
  cardMin: number;
  outputWidth: number;
  open: boolean;
}): { collapseSidebar: boolean; paneWidth: number } {
  const { rowWidth, sidebarWidth, cardMin, outputWidth, open } = opts;
  if (!open) return { collapseSidebar: false, paneWidth: 0 };
  if (rowWidth <= 0) return { collapseSidebar: false, paneWidth: outputWidth };
  const room = (sb: number) => rowWidth - sb - CARD_GUTTER - cardMin;
  const collapseSidebar = room(sidebarWidth) < OUTPUT_MIN_WIDTH;
  const available = room(collapseSidebar ? SIDEBAR_RAIL : sidebarWidth);
  return { collapseSidebar, paneWidth: Math.max(OUTPUT_MIN_WIDTH, Math.min(outputWidth, available)) };
}

/**
 * DESIGN.md layout as a three-column row: Sidebar | main work card | Output pane.
 * The pane is always in flow and opening it narrows the card; it never covers the composer. When
 * the card would fall below its minimum (wider in Edit mode, for the inspector), the sidebar
 * collapses to its rail first, then the pane is capped to what is left. The slot animates width only on open/close; while the pane's
 * resize handle is being dragged the width follows the pointer with no transition. The pane
 * stays mounted until the close animation finishes.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const chat = useWorkspaceStore(selectActiveChat);
  const projects = useWorkspaceStore((s) => s.projects);
  const outputOpen = useWorkspaceStore((s) => s.outputOpen);
  const runLog = useWorkspaceStore((s) => s.runLog);
  const renameChat = useWorkspaceStore((s) => s.renameChat);
  const archiveChat = useWorkspaceStore((s) => s.archiveChat);
  const deleteChat = useWorkspaceStore((s) => s.deleteChat);
  const moveChat = useWorkspaceStore((s) => s.moveChat);
  const createProject = useWorkspaceStore((s) => s.createProject);
  const toggleOutput = useWorkspaceStore((s) => s.toggleOutput);
  const log = useWorkspaceStore((s) => s.log);
  const screen = useScreenStore((s) => s.screen);
  const outputWidth = useOutputLayout((s) => s.width);
  const reduce = useReducedMotion();

  const rowRef = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState(0);
  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const measure = () => setRowWidth(row.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, []);
  const editing = useScreenStore((s) => s.editMode && !!s.screen);
  const { collapseSidebar, paneWidth } = planOutputLayout({
    rowWidth,
    sidebarWidth: readSidebarWidth(),
    cardMin: editing ? CARD_MIN_WIDTH_EDIT : CARD_MIN_WIDTH,
    outputWidth,
    open: outputOpen,
  });

  // The handle reads the stored width for aria-valuenow and drag deltas, so keep the store equal to
  // the width actually rendered. Otherwise a capped pane (Edit mode) hides the drag and the next
  // drag starts from a width the user cannot see.
  useEffect(() => {
    if (!outputOpen || rowWidth <= 0) return;
    if (paneWidth !== outputWidth) useOutputLayout.getState().setWidth(paneWidth);
  }, [outputOpen, rowWidth, paneWidth, outputWidth]);

  // The pane's resize handle lives inside the pane, so detect a drag from pointer state here.
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging]);

  // The pane stays mounted while its slot animates closed, then unmounts.
  const [paneMounted, setPaneMounted] = useState(outputOpen);
  const openRef = useRef(outputOpen);
  openRef.current = outputOpen;
  useEffect(() => {
    if (outputOpen) setPaneMounted(true);
  }, [outputOpen]);

  const actions: WorkspaceActions = {
    renameChat,
    archiveChat,
    deleteChat,
    moveChat,
    createProject: (name, chatId) => void createProject(name, chatId),
    toggleOutput,
  };

  const onShare = useCallback(async (): Promise<ShareOutcome> => {
    const current = useScreenStore.getState().screen;
    if (!current) {
      useScreenStore.setState({ error: "Nothing to share yet. Build a page first." });
      return false;
    }
    let url: string;
    try {
      url = (await sharePrototype(current, current.title)).url;
    } catch (err) {
      useScreenStore.setState({ error: err instanceof Error ? err.message : "Could not create a share link." });
      return false;
    }
    // The link exists from here on, so a clipboard failure must not read as a share failure.
    log("share", url);
    const copied = await copyShareLink(url, typeof navigator !== "undefined" ? navigator.clipboard : undefined);
    return copied ? true : { url };
  }, [log]);

  const close = useCallback(() => {
    if (useWorkspaceStore.getState().outputOpen) toggleOutput();
  }, [toggleOutput]);

  const paneTransition = reduce || dragging ? { duration: 0 } : { duration: PANE_MS / 1000, ease: PANE_EASE };

  return (
    <div ref={rowRef} className="relative flex h-dvh overflow-hidden bg-shell text-ink">
      <Sidebar forceCollapsed={collapseSidebar} />
      <main className="relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface">
        {chat && (
          <Header
            pageTitle={screen?.title || chat.title}
            chat={{ id: chat.id, title: chat.title, archived: chat.archived, projectId: chat.projectId }}
            projects={projects}
            outputOpen={outputOpen}
            actions={actions}
            onShare={onShare}
          />
        )}
        <div data-builder className="relative flex min-h-0 flex-1 flex-col">
          {children}
        </div>
      </main>
      <motion.div
        initial={false}
        animate={{ width: paneWidth }}
        transition={paneTransition}
        onAnimationComplete={() => {
          if (!openRef.current) setPaneMounted(false);
        }}
        onPointerDownCapture={(e) => {
          if ((e.target as HTMLElement).closest?.('[role="separator"]')) setDragging(true);
        }}
        className="flex h-full shrink-0 justify-end overflow-hidden [&>*]:!w-full"
      >
        {paneMounted ? (
          <OutputPane
            open
            onClose={close}
            runLog={runLog.map((e) => ({ ...e, at: new Date(e.at).toISOString() }))}
          />
        ) : null}
      </motion.div>
    </div>
  );
}
