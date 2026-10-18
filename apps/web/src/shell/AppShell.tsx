import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { panelSlide, spring, useReducedMotionSafe } from "../ui/motion";
import { ToastHost } from "../ui/Toast";
import { toast } from "../ui/toastStore";
import { Sidebar, SIDEBAR_RAIL, readSidebarWidth } from "./Sidebar";
import { Header, type ShareOutcome, type WorkspaceActions } from "./Header";
import { shareAndCopy } from "./output";
import { RightPanel, useInspectFollow, usePanelAutoOpen } from "./rightPanel/RightPanel";
import { ResizeHandle } from "./rightPanel/ResizeHandle";
import { planRightPanelLayout, useRightPanel, selectOutputOpen, selectPanelWidth, LAYOUT_CARD_MIN } from "./rightPanel/rightPanelStore";
import { card } from "../ui/styles";
import { selectActiveChat, useWorkspaceStore } from "../store/workspaceStore";
import { useScreenStore } from "../store/screenStore";
import "./builder.css";

/** Window inset and card-to-card gap (the card's mr-2, the panel's mr-2). */
const GUTTER = 8;

/**
 * DESIGN.md layout as a three-column row: Sidebar | main work card | RightPanel (Output, Inspect,
 * Backend). The panel is always in flow and opening it narrows the card; it never covers the
 * composer. The card keeps at least LAYOUT_CARD_MIN. When the row cannot fit sidebar + card +
 * panel, the sidebar collapses to its rail first, then the panel width is capped. The slot animates
 * width on open/close only; while the resize handle is dragged the width follows the pointer.
 * The panel stays mounted until the close animation finishes.
 * The slot width is the one layout animation in the chrome (the card has to give up the space); the
 * panel inside keeps a fixed width and slides and fades with transform and opacity, so its content
 * never reflows mid-animation.
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
  const open = useRightPanel((s) => s.open);
  const outputOpen = useRightPanel(selectOutputOpen);
  const wantedWidth = useRightPanel(selectPanelWidth);
  const dragging = useRightPanel((s) => s.dragging);
  useInspectFollow();
  usePanelAutoOpen();
  const { reduce, t, v } = useReducedMotionSafe();
  const [animating, setAnimating] = useState(false);

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
  // The user can expand a rail the layout forced. Then the panel width is capped to fit instead.
  const [railExpanded, setRailExpanded] = useState(false);
  const { collapseSidebar, panelWidth } = planRightPanelLayout({
    rowWidth,
    sidebarWidth: readSidebarWidth(),
    sidebarRail: railExpanded ? readSidebarWidth() : SIDEBAR_RAIL,
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
    try {
      const { url, copied } = await shareAndCopy(current);
      log("share", url);
      if (copied) toast("Link copied");
      return copied ? true : { url };
    } catch (err) {
      useScreenStore.setState({ error: err instanceof Error ? err.message : "Couldn't create a share link." });
      return false;
    }
  }, [log]);

  const slotTransition = reduce || dragging ? { duration: 0 } : t(spring.gentle);

  return (
    <div ref={rowRef} className="relative flex h-dvh overflow-x-auto overflow-y-hidden bg-shell text-ink">
      <Sidebar forceCollapsed={collapseSidebar && !railExpanded} onForcedExpandChange={setRailExpanded} />
      <main data-part="main-card" style={{ minWidth: LAYOUT_CARD_MIN }} className={`${card} relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden`}>
        {chat && (
          <Header
            pageTitle={chat.title}
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
        animate={{ width: open ? panelWidth + GUTTER * 2 : 0 }}
        transition={slotTransition}
        onAnimationStart={() => setAnimating(true)}
        onAnimationComplete={() => {
          setAnimating(false);
          if (!openRef.current) setPanelMounted(false);
        }}
        style={{ willChange: animating ? "width" : undefined }}
        className="-ml-2 flex h-full shrink-0 justify-end overflow-hidden pl-2"
      >
        {panelMounted ? (
          <motion.div
            variants={v(panelSlide)}
            initial="hidden"
            animate={open ? "show" : "exit"}
            style={{ width: panelWidth, willChange: animating ? "transform, opacity" : undefined }}
            className="relative my-2 mr-2 h-[calc(100%-1rem)] shrink-0"
          >
            <ResizeHandle />
            <RightPanel />
          </motion.div>
        ) : null}
      </motion.div>
      <ToastHost />
    </div>
  );
}
