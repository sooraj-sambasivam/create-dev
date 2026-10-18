import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Folder,
  Library,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { Asset } from "@create/shared";
import { ICON, STROKE, button, input, menuItem, surface } from "../ui/styles";

export interface ChatProject {
  id: string;
  name: string;
}

export interface ChatMenuProps {
  /** Current chat title, shown in the inline rename field. */
  title: string;
  archived: boolean;
  projectId: string | null;
  projects: ChatProject[];
  /** Files the user uploaded in this chat (useScreenStore.assets). */
  assets: Asset[];
  onRename: (title: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  /** null moves the chat out of its project. */
  onMoveToProject: (projectId: string | null) => void;
  /** Creates a project and moves this chat into it. */
  onCreateProject: (name: string) => void;
}

type View = "menu" | "rename" | "files" | "delete" | "project";

const ease = [0.22, 1, 0.36, 1] as const;

const separator = "my-1 h-px bg-line";

const iconClass = "text-ink-2";

/** Elements that take part in arrow-key navigation. Marked with data-menu-item. */
const ITEM_SELECTOR = "[data-menu-item]:not(:disabled)";

const VIEW_LABEL: Record<View, string> = {
  menu: "Chat options",
  rename: "Rename chat",
  files: "Chat files",
  delete: "Delete chat",
  project: "Move to project",
};

/** Label for the archive toggle. Pure, so it can be tested without a DOM. */
export function archiveLabel(archived: boolean): string {
  return archived ? "Unarchive" : "Archive";
}

/** Rename is only submitted when the trimmed name is non-empty and changed. Pure. */
export function nextTitle(draft: string, current: string): string | null {
  const trimmed = draft.trim();
  if (!trimmed || trimmed === current) return null;
  return trimmed;
}

/** Display name for an uploaded asset; falls back to the URL tail when unnamed. Pure. */
export function assetLabel(asset: Asset, index: number): string {
  const name = asset.name.trim();
  if (name) return name;
  const tail = asset.url.split("/").filter(Boolean).pop();
  return tail ?? `File ${index + 1}`;
}

/**
 * Index that an arrow, Home or End key moves to, given the current index (-1 when no item has
 * focus). Returns null for keys that do not navigate. Pure.
 */
export function nextIndex(key: string, current: number, length: number): number | null {
  if (length === 0) return null;
  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : (current + 1) % length;
    case "ArrowUp":
      return current < 0 ? length - 1 : (current - 1 + length) % length;
    case "Home":
      return 0;
    case "End":
      return length - 1;
    default:
      return null;
  }
}

/**
 * Index of the next label that starts with `char`, searching after `current` and wrapping.
 * Returns -1 when none matches. Pure.
 */
export function typeaheadIndex(labels: string[], char: string, current: number): number {
  const needle = char.toLowerCase();
  const length = labels.length;
  for (let step = 1; step <= length; step++) {
    const index = (((current + step) % length) + length) % length;
    if (labels[index].trim().toLowerCase().startsWith(needle)) return index;
  }
  return -1;
}

function menuItems(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
}

/** Roving tabindex: only the focused item is a tab stop. */
function setRovingStop(panel: HTMLElement, active: EventTarget | null) {
  for (const item of menuItems(panel)) item.tabIndex = item === active ? 0 : -1;
}

export function ChatMenu({
  title,
  archived,
  projectId,
  projects,
  assets,
  onRename,
  onArchive,
  onDelete,
  onMoveToProject,
  onCreateProject,
}: ChatMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [name, setName] = useState(title);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  function close(returnFocus = false) {
    setOpen(false);
    setView("menu");
    setCreating(false);
    setNewName("");
    if (returnFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
    // close only touches stable setters and refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Move focus into the panel on open and on every view change, so focus never falls to <body>
  // when the focused button is unmounted.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const target =
      panel.querySelector<HTMLElement>("[data-autofocus]") ?? menuItems(panel)[0] ?? null;
    target?.focus();
    setRovingStop(panel, target);
  }, [open, view, creating]);

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      // Tab leaves the menu: close it and return focus to the trigger instead of trapping focus.
      event.preventDefault();
      close(true);
      return;
    }
    const target = event.target as HTMLElement;
    // Text fields keep their own arrow and typing keys.
    if (target.matches("input, textarea, select")) return;

    const panel = event.currentTarget;
    const items = menuItems(panel);
    const current = items.indexOf(target);
    let next = nextIndex(event.key, current, items.length);
    const isChar =
      event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (next === null && isChar) {
      const found = typeaheadIndex(
        items.map((item) => item.textContent ?? ""),
        event.key,
        current,
      );
      if (found >= 0) next = found;
    }
    if (next === null) return;
    event.preventDefault();
    const destination = items[next];
    destination?.focus();
    setRovingStop(panel, destination ?? null);
  }

  // Closes when focus moves to an element outside the component. A null relatedTarget (a click on
  // non-focusable panel space) is ignored; pointer-outside is handled by onPointer.
  function onRootBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && !rootRef.current?.contains(next)) close();
  }

  function submitNewProject() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateProject(trimmed);
    close(true);
  }

  function renderPanel(): ReactNode {
    if (view === "delete") {
      return (
        <div className="p-2">
          <p className="px-1 pb-3 text-[14px] text-ink-2">Delete this chat? This cannot be undone.</p>
          <div className="flex justify-end gap-1">
            <button
              type="button"
              data-menu-item
              className={button.ghost}
              onClick={() => setView("menu")}
            >
              Cancel
            </button>
            <button
              type="button"
              data-menu-item
              className={button.danger}
              onClick={() => {
                onDelete();
                close(true);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      );
    }

    if (view === "rename") {
      return (
        <form
          className="flex gap-1 p-1"
          onSubmit={(event) => {
            event.preventDefault();
            const next = nextTitle(name, title);
            if (next) onRename(next);
            close(true);
          }}
        >
          <input
            data-autofocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Chat name"
            className={`${input} min-w-0 flex-1`}
          />
          <button
            type="submit"
            data-menu-item
            className={button.primary}
          >
            Save
          </button>
        </form>
      );
    }

    if (view === "files") {
      return (
        <div>
          <button type="button" data-menu-item className={menuItem} onClick={() => setView("menu")}>
            <ChevronLeft size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
            <span>Back</span>
          </button>
          <div className={separator} />
          {assets.length === 0 ? (
            <p className="px-2 py-2 text-[14px] text-ink-3">No files in this chat yet.</p>
          ) : (
            <ul role="list" aria-label="Files" className="max-h-56 overflow-auto">
              {assets.map((asset, index) => (
                <li key={`${asset.url}-${index}`} className="flex h-8 items-center gap-2 px-2 text-[14px] text-ink">
                  <Library size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
                  <span className="min-w-0 flex-1 truncate" title={assetLabel(asset, index)}>
                    {assetLabel(asset, index)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    if (view === "project") {
      return (
        <div>
          <button
            type="button"
            role="menuitem"
            data-menu-item
            className={menuItem}
            onClick={() => {
              setCreating(false);
              setNewName("");
              setView("menu");
            }}
          >
            <ChevronLeft size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
            <span>Back</span>
          </button>
          <div className={separator} />
          <button
            type="button"
            role="menuitemradio"
            data-menu-item
            aria-checked={projectId === null}
            className={menuItem}
            onClick={() => {
              onMoveToProject(null);
              close(true);
            }}
          >
            <span aria-hidden="true" className="size-[18px] shrink-0" />
            <span className="flex-1">No project</span>
            {projectId === null ? (
              <Check size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
            ) : null}
          </button>
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              role="menuitemradio"
              data-menu-item
              aria-checked={project.id === projectId}
              className={menuItem}
              onClick={() => {
                onMoveToProject(project.id);
                close(true);
              }}
            >
              <Folder size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
              <span className="flex-1 truncate">{project.name}</span>
              {project.id === projectId ? (
                <Check size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
              ) : null}
            </button>
          ))}
          <div className={separator} />
          {creating ? (
            <form
              className="flex items-center gap-1 p-0.5"
              onSubmit={(event) => {
                event.preventDefault();
                submitNewProject();
              }}
            >
              <input
                data-autofocus
                value={newName}
                placeholder="Project name"
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setCreating(false);
                    setNewName("");
                  }
                }}
                aria-label="New project name"
                className={`${input} min-w-0 flex-1`}
              />
              <button
                type="submit"
                disabled={!newName.trim()}
                className={button.primary}
              >
                Create
              </button>
            </form>
          ) : (
            <button
              type="button"
              role="menuitem"
              data-menu-item
              className={menuItem}
              onClick={() => {
                setNewName("");
                setCreating(true);
              }}
            >
              <Plus size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
              <span>New project…</span>
            </button>
          )}
        </div>
      );
    }

    return (
      <div>
        <button
          type="button"
          role="menuitem"
          data-menu-item
          className={menuItem}
          onClick={() => {
            setName(title);
            setView("rename");
          }}
        >
          <Pencil size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
          Rename
        </button>
        <button
          type="button"
          role="menuitem"
          data-menu-item
          aria-haspopup="dialog"
          className={menuItem}
          onClick={() => setView("files")}
        >
          <Library size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
          <span className="flex-1">View files</span>
          <ChevronRight size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" className="text-ink-3" />
        </button>
        <button
          type="button"
          role="menuitem"
          data-menu-item
          className={menuItem}
          onClick={() => {
            onArchive();
            close(true);
          }}
        >
          {archived ? (
            <ArchiveRestore size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
          ) : (
            <Archive size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
          )}
          {archiveLabel(archived)}
        </button>
        <button
          type="button"
          role="menuitem"
          data-menu-item
          aria-haspopup="menu"
          className={menuItem}
          onClick={() => setView("project")}
        >
          <Folder size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
          <span className="flex-1">Move to project</span>
          <ChevronRight size={ICON.sm} strokeWidth={STROKE} aria-hidden="true" className="text-ink-3" />
        </button>
        <div className={separator} />
        <button
          type="button"
          role="menuitem"
          data-menu-item
          className={menuItem}
          onClick={() => setView("delete")}
        >
          <Trash2 size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" className={iconClass} />
          <span>Delete</span>
        </button>
      </div>
    );
  }

  const panel = renderPanel();
  // Only the main view and the project list are menus. Rename, files, delete and the
  // project-creation form hold text fields or plain buttons, so they are dialogs.
  const isMenu = view === "menu" || (view === "project" && !creating);

  return (
    <div ref={rootRef} className="relative" onBlur={onRootBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Chat options"
        title="Chat options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setView("menu");
          setCreating(false);
          setOpen((current) => !current);
        }}
        className={button.icon}
      >
        <Ellipsis size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panelRef}
            role={isMenu ? "menu" : "dialog"}
            aria-label={VIEW_LABEL[view]}
            onKeyDown={onPanelKeyDown}
            onFocus={(event) => setRovingStop(event.currentTarget, event.target)}
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease }}
            className={`${surface.menu} absolute right-0 top-full z-40 mt-2 max-h-[min(420px,70vh)] overflow-auto`}
          >
            {panel}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
