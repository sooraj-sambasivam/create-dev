import { Suspense, lazy, useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { X } from "lucide-react";
const Inspector = lazy(() => import("../../editor/Inspector").then((m) => ({ default: m.Inspector })));
import { MotionControls } from "../../motion";
import { useScreenStore } from "../../store/screenStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { BackendTab } from "../output/BackendTab";
import { OutputTab } from "../output/OutputTab";
import { ResizeHandle } from "./ResizeHandle";
import { RIGHT_PANEL_TABS, useRightPanel, type RightPanelTab } from "./rightPanelStore";

const LABELS: Record<RightPanelTab, string> = { output: "Output", inspect: "Inspect", backend: "Backend" };

/**
 * Keeps the Inspect tab honest: leaving edit mode while on Inspect falls back to Output. Selecting an
 * element never switches tabs, so the page stays visible. Mount once, outside the panel.
 */
export function useInspectFollow(): void {
  useEffect(() => {
    let prev = useScreenStore.getState();
    const unsub = useScreenStore.subscribe((s) => {
      const before = prev;
      prev = s;
      if (before.editMode && !s.editMode) useRightPanel.getState().editModeOff();
    });
    return unsub;
  }, []);
}

/**
 * Opens the panel on Output when generation starts and when a page first appears in a chat.
 * Switching chats is not an event: the panel state belongs to the user, not to a chat.
 * Mount once, outside the panel.
 */
export function usePanelAutoOpen(): void {
  useEffect(() => {
    let prevScreen = useScreenStore.getState();
    let prevChat = useWorkspaceStore.getState().activeChatId;
    // workspaceStore sets activeChatId first and then loads the chat's page into screenStore, so the
    // first screen change after a chat id change is the chat switch itself.
    const unsub = useScreenStore.subscribe((s) => {
      const before = prevScreen;
      prevScreen = s;
      const chatNow = useWorkspaceStore.getState().activeChatId;
      const switched = chatNow !== prevChat;
      prevChat = chatNow;
      if (switched) return;
      const started = s.status === "loading" && before.status !== "loading";
      const appeared = before.screen === null && s.screen !== null;
      if (started || appeared) useRightPanel.getState().showOutput();
    });
    return unsub;
  }, []);
}

/** The right-hand column: Output | Inspect | Backend. Fills the width its slot gives it. */
export function RightPanel() {
  const tab = useRightPanel((s) => s.tab);
  const setTab = useRightPanel((s) => s.setTab);
  const close = useRightPanel((s) => s.close);
  const editMode = useScreenStore((s) => s.editMode);
  const hasScreen = useScreenStore((s) => s.screen !== null);
  const hasSelection = useScreenStore((s) => s.selectedId !== null);
  const runLogRaw = useWorkspaceStore((s) => s.runLog);
  const runLog = useMemo(() => runLogRaw.map((e) => ({ ...e, at: new Date(e.at).toISOString() })), [runLogRaw]);

  const canInspect = editMode && hasScreen && hasSelection;
  const inspectHint = !hasScreen ? "Nothing to inspect yet" : !editMode ? "Turn on Edit to inspect" : "Select an element to inspect";
  // A stored "inspect" tab with nothing to inspect shows Output instead.
  const active: RightPanelTab = tab === "inspect" && !canInspect ? "output" : tab;
  const enabled = RIGHT_PANEL_TABS.filter((t) => t !== "inspect" || canInspect);

  const asideRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Partial<Record<RightPanelTab, HTMLButtonElement | null>>>({});

  // Return focus to whatever opened the panel once it closes (unmounts).
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener?.isConnected && (document.activeElement === document.body || document.activeElement === null)) opener.focus();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      // A menu, popover or text field inside the panel owns Escape first: dismiss it, keep the panel.
      const t = e.target as HTMLElement | null;
      const field = t?.closest?.("input, textarea, select, [contenteditable='true']");
      const popup = asideRef.current?.querySelector('[role="menu"], [role="listbox"], [role="dialog"], [aria-expanded="true"]:not([role="tab"])');
      if (field || popup) return;
      e.stopPropagation();
      close();
    }
  };

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = enabled.indexOf(active);
    let next: RightPanelTab | undefined;
    if (e.key === "ArrowRight") next = enabled[(i + 1) % enabled.length];
    else if (e.key === "ArrowLeft") next = enabled[(i - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <aside
      ref={asideRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="complementary"
      aria-label="Side panel"
      data-right-panel
      className="relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-xl bg-surface outline-none"
    >
      <ResizeHandle />
      <header className="flex h-12 shrink-0 items-center gap-2 pl-4 pr-3">
        <div role="tablist" aria-label="Side panel view" className="flex rounded-full bg-tray p-0.5 dark:bg-hover">
          {RIGHT_PANEL_TABS.map((t) => {
            const disabled = t === "inspect" && !canInspect;
            const selected = active === t;
            return (
              <span key={t} title={disabled ? inspectHint : undefined} className="flex">
                <button
                  ref={(el) => {
                    tabRefs.current[t] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`rp-tab-${t}`}
                  aria-selected={selected}
                  aria-controls="rp-body"
                  tabIndex={selected ? 0 : -1}
                  disabled={disabled}
                  onClick={() => setTab(t)}
                  onKeyDown={onTabKeyDown}
                  className={`rounded-full px-3 py-1 text-[14px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-ink-3 ${
                    selected ? "bg-surface text-ink shadow-soft" : disabled ? "" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {LABELS[t]}
                  {t === "inspect" && canInspect && !selected && <span aria-label="Element selected" className="ml-1.5 inline-block size-1.5 rounded-full bg-accent align-middle" />}
                </button>
              </span>
            );
          })}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Close panel"
          title="Close"
          onClick={close}
          className="grid size-8 place-items-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      </header>

      <div id="rp-body" role="tabpanel" aria-labelledby={`rp-tab-${active}`} className={`min-h-0 flex-1 ${active === "output" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}>
        {active === "inspect" ? (
          <div data-right-panel-inspect className="px-4 py-3">
            <Suspense fallback={null}>
              <Inspector />
            </Suspense>
            {hasSelection && <MotionControls />}
          </div>
        ) : active === "backend" ? (
          <BackendTab />
        ) : (
          <OutputTab runLog={runLog} />
        )}
      </div>
    </aside>
  );
}
