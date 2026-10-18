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
import { motion } from "motion/react";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Folder, PanelLeft, Pencil, Plus, SquarePen, Trash2 } from "lucide-react";
import { isBlankChat as isBlankWorkspaceChat, useWorkspaceStore } from "../store/workspaceStore";
import { AvatarMenu } from "../onboarding";
import { ICON, STROKE, button, focusRing, hairline, input, row } from "../ui/styles";
import { duration, ease, spring, useReducedMotionSafe } from "../ui/motion";

const AVATAR_INITIALS = "SS";

/** Nav icons are 18; row actions are 16 (DESIGN.md icon roles). Icon centres sit on x=24 in the rail and expanded. */
const NAV = { size: ICON.lg, strokeWidth: STROKE } as const;
const ROW = { size: ICON.md, strokeWidth: STROKE } as const;

/** Sidebar widths in px. The collapsed icon rail is always SIDEBAR_RAIL wide. */
export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 420;
export const SIDEBAR_DEFAULT = 260;
export const SIDEBAR_RAIL = 48;
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

/** Structural subset of the workspace chat record the sidebar reads. */
export interface SidebarChat {
  id: string;
  title: string;
  projectId?: string | null;
  archived?: boolean;
  messages?: readonly unknown[];
  screen?: unknown;
  history?: readonly unknown[];
}

/** Structural subset of the workspace project record the sidebar reads. */
export interface SidebarProject {
  id: string;
  name: string;
}

/**
 * Left navigation on the grey shell. Reads chats, projects and the active chat from
 * `useWorkspaceStore` and calls its actions. Collapses to a 48px icon rail.
 */
export function Sidebar({
  forceCollapsed = false,
  onForcedExpandChange,
}: {
  /** The layout wants the rail because the window is narrow. */
  forceCollapsed?: boolean;
  /** Called with true when the user expands a forced rail, and false when they collapse it again. */
  onForcedExpandChange?: (expanded: boolean) => void;
} = {}) {
  const chats = useWorkspaceStore((state) => state.chats) as SidebarChat[];
  const projects = useWorkspaceStore((state) => state.projects) as SidebarProject[];
  const activeChatId = useWorkspaceStore((state) => state.activeChatId) as string | null;
  const newChat = useWorkspaceStore((state) => state.newChat);
  const selectChat = useWorkspaceStore((state) => state.selectChat);
  const createProject = useWorkspaceStore((state) => state.createProject);
  const archiveChat = useWorkspaceStore((state) => state.archiveChat);
  const renameChat = useWorkspaceStore((state) => state.renameChat);
  const deleteChat = useWorkspaceStore((state) => state.deleteChat);
  const renameProject = useWorkspaceStore((state) => state.renameProject);
  const deleteProject = useWorkspaceStore((state) => state.deleteProject);

  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [width, setWidth] = useSidebarWidth();
  const [dragging, setDragging] = useState(false);
  const { reduce, t } = useReducedMotionSafe();
  const [sliding, setSliding] = useState(false);
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
    (chat.messages?.length ?? 0) === 0 &&
    isBlankWorkspaceChat({
      title: chat.title,
      screen: (chat.screen ?? null) as never,
      history: (chat.history ?? []) as never,
    });
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
  const railShown = collapsed || forceCollapsed;
  const toggleLabel = railShown ? "Expand sidebar" : "Collapse sidebar";

  function expand() {
    setCollapsed(false);
    if (forceCollapsed) onForcedExpandChange?.(true);
  }

  function collapse() {
    setCollapsed(true);
    onForcedExpandChange?.(false);
  }

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

  if (railShown) {
    return (
      <motion.aside
        aria-label="Sidebar"
        initial={false}
        animate={{ width: SIDEBAR_RAIL }}
        transition={dragging ? { duration: 0 } : t(spring.snappy)}
        onAnimationStart={() => setSliding(true)}
        onAnimationComplete={() => setSliding(false)}
        style={{ willChange: sliding ? "width" : undefined }}
        className="flex h-full shrink-0 flex-col overflow-hidden bg-shell px-2 py-2"
      >
        <motion.div
          key="rail"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduce ? { duration: 0 } : { duration: duration.base, delay: 0.08, ease: ease.standard }}
          className="flex min-h-0 flex-1 flex-col"
        >
        <div className="flex h-12 shrink-0 items-center">
          <IconButton label={toggleLabel} onClick={expand}>
            <PanelLeft {...NAV} className="text-ink-2" />
          </IconButton>
        </div>
        <div className="flex flex-col gap-1">
          <IconButton label="New chat" onClick={() => newChat()}>
            <SquarePen {...NAV} className="text-ink-2" />
          </IconButton>
          <IconButton label="Show projects" onClick={expand}>
            <Folder {...NAV} className="text-ink-2" />
          </IconButton>
        </div>
        <div className="mt-auto flex h-8 shrink-0 items-center">
          <Avatar />
        </div>
        </motion.div>
      </motion.aside>
    );
  }

  return (
    <motion.aside
      aria-label="Sidebar"
      initial={false}
      animate={{ width }}
      transition={dragging ? { duration: 0 } : t(spring.snappy)}
      onAnimationStart={() => setSliding(true)}
      onAnimationComplete={() => setSliding(false)}
      style={{ willChange: sliding ? "width" : undefined }}
      className="relative flex h-full shrink-0 flex-col overflow-hidden bg-shell px-2 py-2"
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
          className={`pointer-events-none absolute inset-y-2 right-[3px] w-px transition-colors duration-120 ${
            dragging ? "bg-accent" : "bg-transparent group-hover:bg-ink-3/40 group-focus-visible:bg-accent"
          }`}
        />
      </div>
      <motion.div
        key="full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduce ? { duration: 0 } : { duration: duration.base, delay: 0.08, ease: ease.standard }}
        style={{ width: width - 16 }}
        className="flex min-h-0 flex-1 flex-col"
      >
      <div className="flex h-12 shrink-0 items-center">
        <IconButton label={toggleLabel} onClick={collapse}>
          <PanelLeft {...NAV} className="text-ink-2" />
        </IconButton>
      </div>

      <div className="flex shrink-0 flex-col gap-1">
        <button
          type="button"
          onClick={() => newChat()}
          className={`${row.base} ${row.hover} text-ink transition-colors duration-120 ${focusRing}`}
        >
          <SquarePen {...NAV} className="shrink-0 text-ink-2" />
          New chat
        </button>
        <button
          type="button"
          data-testid="new-project"
          aria-label="New project"
          onClick={() => setCreating(true)}
          className={`${row.base} ${row.hover} text-ink transition-colors duration-120 ${focusRing}`}
        >
          <Folder {...NAV} className="shrink-0 text-ink-2" />
          New project
        </button>
      </div>

      {creating ? (
        <form className="mt-2 shrink-0 px-0" onSubmit={submitProject}>
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
            className={input}
          />
        </form>
      ) : null}

      <div aria-hidden="true" className={`${hairline} shrink-0`} />

      <nav aria-label="Chats" className="min-h-0 flex-1 overflow-y-auto pb-2">
        {hasProjects ? <h2 className={sectionLabel}>Projects</h2> : null}

        {/* A plain list: the visible "1." "2." are the only numbers, so no list counter is applied. */}
        <ul className="flex list-none flex-col">
          {projects.map((project, index) => {
            const rows = openChats.filter((chat) => chat.projectId === project.id);
            return (
              <li key={project.id} className="mt-2 list-none first:mt-0">
                <ProjectRow
                  project={project}
                  index={index}
                  onRename={renameProject}
                  onDelete={deleteProject}
                  onNewChat={(id) => newChat(id)}
                />
                {rows.length === 0 ? (
                  <p className="flex h-8 items-center pr-2 pl-[34px] text-[14px] text-ink-2">No chats yet</p>
                ) : (
                  <ul className="flex flex-col">
                    {rows.map((chat) => (
                      <li key={chat.id}>
                        <ChatRow
                          chat={chat}
                          active={chat.id === activeChatId}
                          onSelect={selectChat}
                          onArchive={archiveChat}
                          onRename={renameChat}
                          onDelete={deleteChat}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        {openChats.length === 0 && !hasProjects ? (
          <p className="px-[7px] pt-2 text-[12px] text-ink-2">Your chats appear here</p>
        ) : null}

        {unassigned.length > 0 ? (
          <div className={hasProjects ? "mt-2" : ""}>
            <h2 className={sectionLabel}>Chats</h2>
            <ul className="flex flex-col">
              {unassigned.map((chat) => (
                <li key={chat.id}>
                  <ChatRow
                    chat={chat}
                    active={chat.id === activeChatId}
                    onSelect={selectChat}
                    onArchive={archiveChat}
                    onRename={renameChat}
                    onDelete={deleteChat}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {archived.length > 0 ? (
          <div className="mt-2">
            <button
              type="button"
              aria-expanded={archivedOpen}
              onClick={() => setArchivedOpen((value) => !value)}
              className={`flex h-8 w-full items-center gap-1 rounded-lg px-[7px] text-left text-[12px] font-medium text-ink-2 transition-colors duration-120 ${row.hover} ${focusRing}`}
            >
              Archived
              <span className="ml-auto tabular-nums">{archived.length}</span>
              {archivedOpen ? (
                <ChevronDown size={ICON.md} strokeWidth={STROKE} className="shrink-0 text-ink-2" />
              ) : (
                <ChevronRight size={ICON.md} strokeWidth={STROKE} className="shrink-0 text-ink-2" />
              )}
            </button>
            {archivedOpen ? (
              <ul className="flex flex-col">
                {archived.map((chat) => (
                  <li key={chat.id}>
                    <ChatRow
                      chat={chat}
                      active={chat.id === activeChatId}
                      onSelect={selectChat}
                      onArchive={archiveChat}
                      onRename={renameChat}
                      onDelete={deleteChat}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </nav>

      <div className="flex h-8 shrink-0 items-center">
        <Avatar />
      </div>
      </motion.div>
    </motion.aside>
  );
}

const actionButton = button.iconSm;
/** Section label ("Projects", "Chats"): 12px, aligned with the row icons. */
const sectionLabel = "flex h-8 items-center px-[7px] text-[12px] font-medium text-ink-2";
/**
 * Row actions float over the row end with no fill of their own. The title fades out under them on
 * hover or focus (a mask), so its width never changes and no opaque box appears.
 */
const revealActions =
  "absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity duration-120 group-hover:opacity-100 group-focus-within:opacity-100";
const titleFade =
  "group-hover:[mask-image:linear-gradient(to_right,#000_calc(100%-92px),transparent_calc(100%-72px))] group-focus-within:[mask-image:linear-gradient(to_right,#000_calc(100%-92px),transparent_calc(100%-72px))]";

/** Inline text field used to rename a row. Enter saves, Escape or blur cancels. */
function RenameField({
  initial,
  label,
  className,
  onSubmit,
  onCancel,
}: {
  initial: string;
  label: string;
  className: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const trimmed = value.trim();
    if (save && trimmed && trimmed !== initial) onSubmit(trimmed);
    else onCancel();
  };
  return (
    <input
      autoFocus
      value={value}
      aria-label={label}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        }
      }}
      className={`${input} min-w-0 flex-1 ${className}`}
    />
  );
}

/** Inline two-step delete: the row asks once, in words, before anything is removed. */
function ConfirmDelete({
  what,
  onConfirm,
  onCancel,
}: {
  what: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Delete ${what}?`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
      className="flex h-8 items-center gap-1 pr-1 pl-[34px] text-[14px]"
    >
      <span className="min-w-0 flex-1 truncate text-ink-2">Delete?</span>
      <button
        type="button"
        autoFocus
        onClick={onConfirm}
        className={`${button.danger} !h-6 !rounded-md !px-2 text-[12px]`}
      >
        Delete
      </button>
      <button
        type="button"
        onClick={onCancel}
        className={`${button.ghost} !h-6 !rounded-md !px-2 text-[12px]`}
      >
        Cancel
      </button>
    </div>
  );
}

function ProjectRow({
  project,
  index,
  onRename,
  onDelete,
  onNewChat,
}: {
  project: SidebarProject;
  index: number;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onNewChat: (id: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  if (mode === "delete") {
    return (
      <ConfirmDelete
        what={project.name}
        onConfirm={() => onDelete(project.id)}
        onCancel={() => setMode("view")}
      />
    );
  }
  return (
    <div className={`group relative ${row.base} ${row.hover} text-ink`}>
      <span className="w-[18px] shrink-0 text-center tabular-nums text-ink-2">{index + 1}.</span>
      {mode === "rename" ? (
        <RenameField
          initial={project.name}
          label={`Rename project ${project.name}`}
          className=""
          onSubmit={(name) => {
            onRename(project.id, name);
            setMode("view");
          }}
          onCancel={() => setMode("view")}
        />
      ) : (
        <>
          <span className={`min-w-0 flex-1 truncate ${titleFade}`} title={project.name}>{project.name}</span>
          <div className={revealActions}>
            <button
              type="button"
              onClick={() => onNewChat(project.id)}
              aria-label={`New chat in ${project.name}`}
              title="New chat in project"
              className={actionButton}
            >
              <SquarePen size={ICON.md} strokeWidth={STROKE} />
            </button>
            <button
              type="button"
              onClick={() => setMode("rename")}
              aria-label={`Rename project ${project.name}`}
              title="Rename project"
              className={actionButton}
            >
              <Pencil size={ICON.md} strokeWidth={STROKE} />
            </button>
            <button
              type="button"
              onClick={() => setMode("delete")}
              aria-label={`Delete project ${project.name}`}
              title="Delete project"
              className={actionButton}
            >
              <Trash2 size={ICON.md} strokeWidth={STROKE} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ChatRow({
  chat,
  active,
  onSelect,
  onArchive,
  onRename,
  onDelete,
}: {
  chat: SidebarChat;
  active: boolean;
  onSelect: (id: string) => void;
  onArchive?: (id: string) => void;
  onRename?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  if (mode === "delete" && onDelete) {
    return (
      <ConfirmDelete
        what={chat.title}
        onConfirm={() => onDelete(chat.id)}
        onCancel={() => setMode("view")}
      />
    );
  }
  if (mode === "rename" && onRename) {
    return (
      <div className="flex items-center pl-[30px]">
        <RenameField
          initial={chat.title}
          label={`Rename ${chat.title}`}
          className=""
          onSubmit={(title) => {
            onRename(chat.id, title);
            setMode("view");
          }}
          onCancel={() => setMode("view")}
        />
      </div>
    );
  }
  const hasActions = Boolean(onArchive || onRename || onDelete);
  return (
    <div className="group relative flex items-center">
      <button
        type="button"
        onClick={() => onSelect(chat.id)}
        aria-current={active ? "true" : undefined}
        title={chat.title}
        className={`flex h-8 min-w-0 flex-1 items-center rounded-lg pr-[7px] pl-[34px] text-left text-[14px] transition-colors duration-120 ${focusRing} ${
          active ? row.active : `${row.idle} ${row.hover}`
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${titleFade}`}>{chat.title}</span>
      </button>
      {hasActions ? (
        <div className={revealActions}>
          {onRename ? (
            <button
              type="button"
              onClick={() => setMode("rename")}
              aria-label={`Rename ${chat.title}`}
              title="Rename chat"
              className={actionButton}
            >
              <Pencil size={ICON.md} strokeWidth={STROKE} />
            </button>
          ) : null}
          {onArchive ? (
            <button
              type="button"
              onClick={() => onArchive(chat.id)}
              aria-label={`${chat.archived ? "Unarchive" : "Archive"} ${chat.title}`}
              title={chat.archived ? "Unarchive" : "Archive"}
              className={actionButton}
            >
              {chat.archived ? <ArchiveRestore size={ICON.md} strokeWidth={STROKE} /> : <Archive size={ICON.md} strokeWidth={STROKE} />}
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={() => setMode("delete")}
              aria-label={`Delete ${chat.title}`}
              title="Delete chat"
              className={actionButton}
            >
              <Trash2 size={ICON.md} strokeWidth={STROKE} />
            </button>
          ) : null}
        </div>
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
      className={button.icon}
    >
      {children}
    </button>
  );
}

function Avatar() {
  return <AvatarMenu initials={AVATAR_INITIALS} />;
}
