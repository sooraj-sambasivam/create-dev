import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Archive, ChevronDown, ChevronRight, Folder, PanelLeft, Plus, SquarePen } from "lucide-react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { AvatarMenu } from "../onboarding";

/** Title given to a chat that has not been named yet. Blank chats are not listed as rows. */
const NEW_CHAT_TITLE = "New chat";
const AVATAR_INITIALS = "SS";

const ICON = { size: 18, strokeWidth: 1.75 } as const;

/** Sidebar widths in px. The collapsed icon rail is always SIDEBAR_RAIL wide. */
export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 420;
export const SIDEBAR_DEFAULT = 260;
export const SIDEBAR_RAIL = 56;
/** localStorage key holding the expanded sidebar width as a plain number. */
export const SIDEBAR_WIDTH_KEY = "create-sidebar-width";
/** Arrow-key step for the resize handle. */
const KEY_STEP = 8;

/** Clamps a width to [SIDEBAR_MIN, SIDEBAR_MAX] and rounds it. Non-finite input gives the default. */
export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT;
  return Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, value)));
}

/** Reads the persisted width. Missing, blocked or malformed storage gives the default. */
export function readSidebarWidth(): number {
  try {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT;
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw === null || raw.trim() === "") return SIDEBAR_DEFAULT;
    return clampSidebarWidth(Number(raw));
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

/** Persists the width. A blocked store is ignored, so the width then lasts for this page only. */
export function writeSidebarWidth(value: number): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(value));
  } catch {
    /* storage unavailable */
  }
}

/** The expanded width, clamped and persisted on every change. */
function useSidebarWidth(): [number, (value: number) => void] {
  const [width, setWidthState] = useState<number>(readSidebarWidth);
  const setWidth = useCallback((value: number) => {
    const next = clampSidebarWidth(value);
    setWidthState(next);
    writeSidebarWidth(next);
  }, []);
  return [width, setWidth];
}

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Structural subset of the workspace chat record the sidebar reads. */
export interface SidebarChat {
  id: string;
  title: string;
  projectId?: string | null;
  archived?: boolean;
  messages?: readonly unknown[];
}

/** Structural subset of the workspace project record the sidebar reads. */
export interface SidebarProject {
  id: string;
  name: string;
}

/**
 * Left navigation on the grey shell. Reads chats, projects and the active chat from
 * `useWorkspaceStore` and calls its actions. Collapses to a 56px icon rail.
 */
export function Sidebar({ forceCollapsed = false }: { forceCollapsed?: boolean } = {}) {
  const chats = useWorkspaceStore((state) => state.chats) as SidebarChat[];
  const projects = useWorkspaceStore((state) => state.projects) as SidebarProject[];
  const activeChatId = useWorkspaceStore((state) => state.activeChatId) as string | null;
  const newChat = useWorkspaceStore((state) => state.newChat);
  const selectChat = useWorkspaceStore((state) => state.selectChat);
  const createProject = useWorkspaceStore((state) => state.createProject);
  const archiveChat = useWorkspaceStore((state) => state.archiveChat);

  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [width, setWidth] = useSidebarWidth();
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  // While dragging, keep the text unselectable and the column cursor on the whole page.
  useEffect(() => {
    if (!dragging) return;
    const body = document.body;
    const prevSelect = body.style.userSelect;
    const prevCursor = body.style.cursor;
    body.style.userSelect = "none";
    body.style.cursor = "col-resize";
    return () => {
      body.style.userSelect = prevSelect;
      body.style.cursor = prevCursor;
    };
  }, [dragging]);

  const archived = chats.filter((chat) => chat.archived);
  // A blank, untitled chat is already represented by the "New chat" button, so it is not listed as a row.
  const isBlankChat = (chat: SidebarChat) =>
    (chat.messages?.length ?? 0) === 0 && chat.title === NEW_CHAT_TITLE;
  const openChats = chats.filter((chat) => !chat.archived && !isBlankChat(chat));
  const unassigned = openChats.filter((chat) => !chat.projectId);

  function submitProject(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createProject(trimmed);
    setName("");
    setCreating(false);
  }

  const hasProjects = projects.length > 0;
  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  function onHandlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // Stops the browser from starting a text selection on the drag.
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
    setDragging(true);
  }

  function onHandlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    setWidth(active.startWidth + event.clientX - active.startX);
  }

  function onHandlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onHandleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") setWidth(width - KEY_STEP);
    else if (event.key === "ArrowRight") setWidth(width + KEY_STEP);
    else if (event.key === "Home") setWidth(SIDEBAR_MIN);
    else if (event.key === "End") setWidth(SIDEBAR_MAX);
    else return;
    event.preventDefault();
  }

  if (collapsed || forceCollapsed) {
    return (
      <aside
        aria-label="Sidebar"
        style={{ width: SIDEBAR_RAIL }}
        className="flex h-full shrink-0 flex-col items-center bg-shell px-2 py-3"
      >
        <div className="flex h-[44px] items-center px-1">
          <IconButton label={toggleLabel} onClick={() => setCollapsed(false)}>
            <PanelLeft {...ICON} className="text-ink-2" />
          </IconButton>
        </div>
        <div className="mt-2 flex flex-col items-center gap-1">
          <IconButton label="New chat" onClick={() => newChat()}>
            <SquarePen {...ICON} className="text-ink-2" />
          </IconButton>
          <IconButton
            label="Projects"
            onClick={() => {
              setCollapsed(false);
            }}
          >
            <Folder {...ICON} className="text-ink-2" />
          </IconButton>
        </div>
        <div className="mt-auto flex h-8 items-center">
          <Avatar />
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Sidebar"
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col bg-shell px-2 py-3"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize. Double-click to reset."
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerEnd}
        onPointerCancel={onHandlePointerEnd}
        onDoubleClick={() => setWidth(SIDEBAR_DEFAULT)}
        onKeyDown={onHandleKeyDown}
        className="group absolute inset-y-0 right-0 z-10 w-[8px] cursor-col-resize touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-[3px] w-px transition-colors duration-150 ${
            dragging ? "bg-ink-3" : "bg-transparent group-hover:bg-line group-focus-visible:bg-accent"
          }`}
        />
      </div>
      <div className="flex h-[44px] items-center px-1">
        <IconButton label={toggleLabel} onClick={() => setCollapsed(true)}>
          <PanelLeft {...ICON} className="text-ink-2" />
        </IconButton>
      </div>

      <button
        type="button"
        onClick={() => newChat()}
        className={`mt-2 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[14px] text-ink transition-colors duration-150 hover:bg-hover ${focusRing}`}
      >
        <SquarePen {...ICON} className="shrink-0 text-ink-2" />
        New chat
      </button>

      <nav aria-label="Chats" className="mt-4 min-h-0 flex-1 overflow-y-auto pb-4">
        {hasProjects ? (
          <div className="flex h-8 items-center justify-between pr-1 pl-2">
            <h2 className="text-[12px] text-ink-2">Projects</h2>
            {creating ? null : (
              <button
                type="button"
                data-testid="new-project"
                onClick={() => setCreating(true)}
                aria-label="New project"
                title="New project"
                className={`grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2 ${focusRing}`}
              >
                <Plus {...ICON} size={16} />
              </button>
            )}
          </div>
        ) : null}

        {creating ? (
          <form className="px-2" onSubmit={submitProject}>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setName("");
                  setCreating(false);
                }
              }}
              onBlur={() => {
                if (!name.trim()) setCreating(false);
              }}
              placeholder="Project name"
              aria-label="New project name"
              className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
            />
          </form>
        ) : null}

        {!hasProjects && !creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={`flex h-8 w-full items-center gap-2 rounded-lg pr-2 pl-2 text-left text-[14px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2 ${focusRing}`}
          >
            <Plus {...ICON} className="shrink-0" />
            New project
          </button>
        ) : null}

        {/* A plain list: the visible "1." "2." are the only numbers, so no list counter is applied. */}
        <ul className="flex list-none flex-col">
          {projects.map((project, index) => {
            const rows = openChats.filter((chat) => chat.projectId === project.id);
            return (
              <li key={project.id} className="mt-2 list-none first:mt-0">
                <div className="flex h-8 items-center gap-2 pr-2 pl-2 text-[14px] text-ink">
                  <span className="w-4 shrink-0 text-right tabular-nums text-ink-2">{index + 1}.</span>
                  <span className="truncate">{project.name}</span>
                </div>
                {rows.length === 0 ? (
                  <p className="flex h-8 items-center pr-2 pl-8 text-[14px] text-ink-2">No chats yet</p>
                ) : (
                  <ul className="flex flex-col">
                    {rows.map((chat) => (
                      <li key={chat.id}>
                        <ChatRow
                          chat={chat}
                          active={chat.id === activeChatId}
                          nested
                          onSelect={selectChat}
                          onArchive={archiveChat}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        {unassigned.length > 0 ? (
          <div className="mt-4">
            <h2 className="flex h-8 items-center pl-2 text-[12px] text-ink-2">Chats</h2>
            <ul className="flex flex-col">
              {unassigned.map((chat) => (
                <li key={chat.id}>
                  <ChatRow
                    chat={chat}
                    active={chat.id === activeChatId}
                    onSelect={selectChat}
                    onArchive={archiveChat}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {archived.length > 0 ? (
          <div className="mt-4">
            <button
              type="button"
              aria-expanded={archivedOpen}
              onClick={() => setArchivedOpen((value) => !value)}
              className={`flex h-8 w-full items-center gap-1 rounded-lg pr-2 pl-2 text-left text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover ${focusRing}`}
            >
              Archived
              <span className="ml-auto tabular-nums">{archived.length}</span>
              {archivedOpen ? (
                <ChevronDown size={16} strokeWidth={1.75} className="shrink-0 text-ink-2" />
              ) : (
                <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-ink-2" />
              )}
            </button>
            {archivedOpen ? (
              <ul className="flex flex-col">
                {archived.map((chat) => (
                  <li key={chat.id}>
                    <ChatRow
                      chat={chat}
                      active={chat.id === activeChatId}
                      nested
                      muted
                      onSelect={selectChat}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </nav>

      <div className="flex h-8 items-center px-1">
        <Avatar />
      </div>
    </aside>
  );
}

function ChatRow({
  chat,
  active,
  nested = false,
  muted = false,
  onSelect,
  onArchive,
}: {
  chat: SidebarChat;
  active: boolean;
  nested?: boolean;
  muted?: boolean;
  onSelect: (id: string) => void;
  onArchive?: (id: string) => void;
}) {
  return (
    <div className="group relative flex items-center">
      <button
        type="button"
        onClick={() => onSelect(chat.id)}
        aria-current={active ? "true" : undefined}
        title={chat.title}
        className={`flex h-8 min-w-0 flex-1 items-center truncate rounded-lg text-left text-[14px] transition-colors duration-150 ${focusRing} ${
          nested ? "pl-8" : "pl-2"
        } ${onArchive ? "pr-2 group-hover:pr-8 group-focus-within:pr-8" : "pr-2"} ${
          active
            ? "bg-hover text-ink"
            : `hover:bg-hover/60 ${muted ? "text-ink-2" : "text-ink-2"}`
        }`}
      >
        <span className="truncate">{chat.title}</span>
      </button>
      {onArchive ? (
        <button
          type="button"
          onClick={() => onArchive(chat.id)}
          aria-label={`Archive ${chat.title}`}
          title="Archive"
          className={`absolute top-1/2 right-1 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-ink-2 opacity-0 transition-[background-color,opacity] duration-150 hover:bg-tray group-hover:opacity-100 focus-visible:opacity-100 ${focusRing}`}
        >
          <Archive size={16} strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover ${focusRing}`}
    >
      {children}
    </button>
  );
}

function Avatar() {
  return <AvatarMenu initials={AVATAR_INITIALS} />;
}
