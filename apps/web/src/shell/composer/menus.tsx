import { useState, type RefObject } from "react";
import { Check, Folder, LibraryBig, Paperclip, Plus } from "lucide-react";
import type { Asset } from "@create/shared";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { Popover, menuItemClass as menuItem } from "./Popover";

const ICON = { size: 18, strokeWidth: 1.75 } as const;
const TRAY_ICON = { size: 16, strokeWidth: 1.75 } as const;
const Blank = () => <span className="w-[18px] shrink-0" />;
const LEAD = "shrink-0 text-[var(--c-ink-2)]";

const trayBtn =
  "inline-flex h-8 items-center gap-2 rounded-lg px-2 text-[14px] font-normal text-[var(--c-ink-2)] hover:bg-[var(--c-hover)] hover:text-[var(--c-ink)] focus-visible:outline-none";

export function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const projects = useWorkspaceStore((s) => s.projects);
  const chat = useWorkspaceStore((s) => s.chats.find((c) => c.id === s.activeChatId));
  const projectId = chat?.projectId ?? null;
  const current = projects.find((p) => p.id === projectId);

  /** Move the open chat; with no chat yet, start one inside the project. */
  const select = (id: string | null) => {
    const ws = useWorkspaceStore.getState();
    if (ws.activeChatId) ws.moveChat(ws.activeChatId, id);
    else if (id) ws.newChat(id);
  };
  const create = (n: string) => {
    const ws = useWorkspaceStore.getState();
    const id = ws.createProject(n, ws.activeChatId ?? undefined);
    if (!ws.activeChatId) ws.newChat(id);
  };

  const row = (id: string | null, label: string) => (
    <button
      key={id ?? "none"}
      type="button"
      role="menuitemradio"
      aria-checked={projectId === id}
      className={menuItem}
      onClick={() => {
        select(id);
        setOpen(false);
      }}
    >
      <Folder {...ICON} className={LEAD} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {projectId === id ? <Check {...ICON} /> : <Blank />}
    </button>
  );

  return (
    <Popover
      open={open}
      side="down"
      onClose={() => {
        setOpen(false);
        setCreating(false);
      }}
      panel={
        <div>
          {row(null, "No project")}
          {projects.map((p) => row(p.id, p.name))}
          {creating ? (
            <form
              className="flex gap-1 px-1 py-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                create(name);
                setName("");
                setCreating(false);
                setOpen(false);
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
                aria-label="Project name"
                className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--c-line)] bg-[var(--c-surface)] px-2 text-[14px] text-[var(--c-ink)] outline-none placeholder:text-[var(--c-ink-3)] focus-visible:border-[var(--c-accent)]"
              />
              <button type="submit" className="rounded-lg bg-[var(--c-ink)] px-2.5 text-[14px] text-surface">Add</button>
            </form>
          ) : (
            <button type="button" className={`${menuItem} text-[var(--c-ink-2)]`} onClick={() => setCreating(true)}>
              <Plus {...ICON} className={LEAD} />
              <span className="min-w-0 flex-1 truncate">Create new project…</span>
            </button>
          )}
        </div>
      }
    >
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Choose project" onClick={() => setOpen((o) => !o)} className={`${trayBtn} max-w-[200px]`}>
        <Folder {...TRAY_ICON} className="shrink-0" />
        <span className="truncate">{current ? current.name : "Choose project"}</span>
      </button>
    </Popover>
  );
}

export function FilesMenu({
  assets,
  inputRef,
  uploading,
  error,
}: {
  assets: Asset[];
  inputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      side="down"
      wide
      panel={
        <div>
          <div className="px-2 pt-1.5 pb-1 text-[12px] text-[var(--c-ink-3)]">Files</div>
          {assets.length === 0 ? (
            <p className="px-2 py-2 text-[14px] text-[var(--c-ink-2)]">No files yet.</p>
          ) : (
            <ul className="mb-1">
              {assets.map((a) => (
                <li key={a.url} className="flex h-8 items-center gap-2 rounded-lg px-2">
                  <Paperclip {...ICON} className={LEAD} />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--c-ink)]">{a.name}</span>
                </li>
              ))}
            </ul>
          )}
          {error ? <p role="alert" className="px-2 pb-1 text-[12px] text-[var(--c-bad)]">{error}</p> : null}
          <div aria-hidden="true" className="mx-2 my-1 h-px bg-[var(--c-line)]" />
          <button type="button" disabled={uploading} className={`${menuItem} text-[var(--c-ink-2)] disabled:opacity-50`} onClick={() => inputRef.current?.click()}>
            <Paperclip {...ICON} className={LEAD} />
            <span className="min-w-0 flex-1 truncate">{uploading ? "Uploading…" : "Attach from disk"}</span>
          </button>
        </div>
      }
    >
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Files" onClick={() => setOpen((o) => !o)} className={trayBtn}>
        <LibraryBig {...TRAY_ICON} className="shrink-0" />
        <span>Files</span>
        {assets.length > 0 ? <span className="text-[12px] text-[var(--c-ink-3)]">{assets.length}</span> : null}
      </button>
    </Popover>
  );
}
