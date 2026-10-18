import { Suspense, lazy, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
const Inspector = lazy(() => import("../../editor/Inspector").then((m) => ({ default: m.Inspector })));
import { MotionControls } from "../../motion";
import { useScreenStore } from "../../store/screenStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { BackendTab } from "../output/BackendTab";
import { OutputTab } from "../output/OutputTab";
import { ActivePill } from "../../ui/ActivePill";
import { ICON, STROKE, button, card, segmented } from "../../ui/styles";
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

  // With nothing selected, Inspect shows the page settings (title, theme, colour, font, files).
  const canInspect = editMode && hasScreen;
  const inspectHint = !hasScreen ? "Nothing to inspect yet" : "Switch to Edit to inspect";
  // A stored "inspect" tab with nothing to inspect shows Output instead.
  const active: RightPanelTab = tab === "inspect" && !canInspect ? "output" : tab;
  const enabled = RIGHT_PANEL_TABS.filter((t) => t !== "inspect" || canInspect);

  const pillId = useId();
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
      className={`${card} relative flex h-full w-full min-w-0 flex-col overflow-hidden outline-none`}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <div role="tablist" aria-label="Side panel view" className={segmented.root}>
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
                  className={`${segmented.item} ${selected ? segmented.active : ""}`}
                >
                  {selected && <ActivePill layoutId={pillId} />}
                  {LABELS[t]}
                  {t === "inspect" && canInspect && hasSelection && !selected && <span aria-label="Element selected" className="absolute right-2 top-1.5 size-1.5 rounded-full bg-accent" />}
                </button>
              </span>
            );
          })}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Close side panel"
          title="Close side panel"
          onClick={close}
          className={button.icon}
        >
          <X size={ICON.lg} strokeWidth={STROKE} />
        </button>
      </header>

      <div id="rp-body" role="tabpanel" aria-labelledby={`rp-tab-${active}`} className="flex min-h-0 flex-1 flex-col">
        {/* Output stays mounted behind the other tabs so the page keeps its state and Export works from Backend. */}
        <div className={active === "output" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"}>
          <OutputTab />
        </div>
        {active === "inspect" ? (
          <ScrollBody data-right-panel-inspect>
            <Suspense fallback={null}>
              <Inspector />
            </Suspense>
            {hasSelection && <MotionControls />}
          </ScrollBody>
        ) : active === "backend" ? (
          <ScrollBody>
            <BackendTab />
          </ScrollBody>
        ) : null}
      </div>
    </aside>
  );
}

/** Scrolling tab body: one px-4 inset, room at the end, and a soft fade where content runs under the card edge. */
function ScrollBody({ children, ...rest }: { children: ReactNode } & Record<`data-${string}`, boolean>) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div {...rest} className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-1">
        {children}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-surface to-transparent" />
    </div>
  );
}
