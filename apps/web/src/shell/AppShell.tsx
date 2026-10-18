import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Sidebar, SIDEBAR_RAIL, readSidebarWidth } from "./Sidebar";
import { Header, copyShareLink, type ShareOutcome, type WorkspaceActions } from "./Header";
import { sharePrototype } from "./output";
import { RightPanel, useInspectFollow, usePanelAutoOpen } from "./rightPanel/RightPanel";
import { planRightPanelLayout, useRightPanel, selectOutputOpen, LAYOUT_CARD_MIN } from "./rightPanel/rightPanelStore";
import { selectActiveChat, useWorkspaceStore } from "../store/workspaceStore";
import { useScreenStore } from "../store/screenStore";
import "./builder.css";

/** Right panel open/close timing. Reduced motion makes both instant. */
const PANEL_MS = 220;
const PANEL_EASE = "easeOut" as const;
/** Gap between the card and the window edge / panel (the card's mr-2). */
const GUTTER = 8;

/**
 * DESIGN.md layout as a three-column row: Sidebar | main work card | RightPanel (Output, Inspect,
 * Backend). The panel is always in flow and opening it narrows the card; it never covers the
 * composer. The card keeps at least LAYOUT_CARD_MIN. When the row cannot fit sidebar + card +
 * panel, the sidebar collapses to its rail first, then the panel width is capped. The slot animates
 * width on open/close only; while the resize handle is dragged the width follows the pointer.
 * The panel stays mounted until the close animation finishes.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const chat = useWorkspaceStore(selectActiveChat);
  const projects = useWorkspaceStore((s) => s.projects);
  const renameChat = useWorkspaceStore((s) => s.renameChat);
  const archiveChat = useWorkspaceStore((s) => s.archiveChat);
  const deleteChat = useWorkspaceStore((s) => s.deleteChat);
  const moveChat = useWorkspaceStore((s) => s.moveChat);
  const createProject = useWorkspaceStore((s) => s.createProject);
  const toggleOutput = useRightPanel((s) => s.toggleOutput);
  const log = useWorkspaceStore((s) => s.log);
  const screen = useScreenStore((s) => s.screen);
  const open = useRightPanel((s) => s.open);
  const outputOpen = useRightPanel(selectOutputOpen);
  const wantedWidth = useRightPanel((s) => s.width);
  const dragging = useRightPanel((s) => s.dragging);
  useInspectFollow();
  usePanelAutoOpen();
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
  const { collapseSidebar, panelWidth } = planRightPanelLayout({
    rowWidth,
    sidebarWidth: readSidebarWidth(),
    sidebarRail: SIDEBAR_RAIL,
    panelWidth: wantedWidth,
    open,
  });

  // The panel stays mounted while its slot animates closed, then unmounts.
  const [panelMounted, setPanelMounted] = useState(open);
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (open) setPanelMounted(true);
  }, [open]);

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

  const slotTransition = reduce || dragging ? { duration: 0 } : { duration: PANEL_MS / 1000, ease: PANEL_EASE };

  return (
    <div ref={rowRef} className="relative flex h-dvh overflow-x-auto overflow-y-hidden bg-shell text-ink">
      <Sidebar forceCollapsed={collapseSidebar} />
      <main style={{ minWidth: LAYOUT_CARD_MIN }} className="relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface">
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
        animate={{ width: open ? panelWidth + GUTTER : 0 }}
        transition={slotTransition}
        onAnimationComplete={() => {
          if (!openRef.current) setPanelMounted(false);
        }}
        className="flex h-full shrink-0 justify-end overflow-hidden"
      >
        {panelMounted ? (
          <div className="my-2 mr-2 h-[calc(100%-1rem)] shrink-0" style={{ width: panelWidth }}>
            <RightPanel />
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
