import { useState, type RefObject } from "react";
import { Check, Folder, LibraryBig, Paperclip, Plus } from "lucide-react";
import type { Asset } from "@create/shared";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { ICON, STROKE, button, input, menuItem, text } from "../../ui/styles";
import { Popover } from "./Popover";

/** Menu rows use the large icon; the tray triggers use the medium one (DESIGN.md icon roles). */
const ROW_ICON = { size: ICON.lg, strokeWidth: STROKE } as const;
const TRAY_ICON = { size: ICON.md, strokeWidth: STROKE } as const;
const Blank = () => <span className="w-[18px] shrink-0" />;
const LEAD = "shrink-0 text-ink-2";

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
      <Folder {...ROW_ICON} className={LEAD} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {projectId === id ? <Check {...ROW_ICON} /> : <Blank />}
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
                className={`${input} min-w-0 flex-1`}
              />
              <button type="submit" className={button.primary}>Add</button>
            </form>
          ) : (
            <button type="button" className={`${menuItem} text-ink-2`} onClick={() => setCreating(true)}>
              <Plus {...ROW_ICON} className={LEAD} />
              <span className="min-w-0 flex-1 truncate">New project…</span>
            </button>
          )}
        </div>
      }
    >
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Choose project" onClick={() => setOpen((o) => !o)} className={`${button.ghost} max-w-[200px]`}>
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
  onInsert,
}: {
  assets: Asset[];
  inputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  error: string | null;
  /** Put "@name" in the message field. */
  onInsert: (name: string) => void;
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
          <div className={`${text.meta} px-2 pt-1.5 pb-1`}>Files</div>
          {assets.length === 0 ? (
            <p className="px-2 py-2 text-[14px] text-ink-2">No files yet</p>
          ) : (
            <ul className="mb-1">
              {assets.map((a) => (
                <li key={a.url}>
                  <button
                    type="button"
                    role="menuitem"
                    title={`Mention @${a.name} in your message`}
                    className={menuItem}
                    onClick={() => {
                      onInsert(a.name);
                      setOpen(false);
                    }}
                  >
                    <Paperclip {...ROW_ICON} className={LEAD} />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="text-[12px] text-ink-3">@</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error ? <p role="alert" className="px-2 pb-1 text-[12px] text-bad">{error}</p> : null}
          <div aria-hidden="true" className="mx-2 my-1 h-px bg-line" />
          <button type="button" disabled={uploading} className={`${menuItem} text-ink-2 disabled:opacity-50`} onClick={() => inputRef.current?.click()}>
            <Paperclip {...ROW_ICON} className={LEAD} />
            <span className="min-w-0 flex-1 truncate">{uploading ? "Uploading…" : "Attach from disk"}</span>
          </button>
        </div>
      }
    >
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Files" onClick={() => setOpen((o) => !o)} className={button.ghost}>
        <LibraryBig {...TRAY_ICON} className="shrink-0" />
        <span>Files</span>
        {assets.length > 0 ? <span className="text-[12px] text-ink-3">{assets.length}</span> : null}
      </button>
    </Popover>
  );
}
