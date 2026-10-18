import { useState, type RefObject } from "react";
import { Blocks, Check, ChevronDown, Eye, Folder, GitBranch, HardDrive, LibraryBig, Mail, NotebookText, Paperclip, Plus, ShieldCheck, ShieldQuestion, Sparkles, type LucideIcon, type LucideProps } from "lucide-react";
import type { Asset } from "@create/shared";
import { Popover, menuItemClass as menuItem } from "./Popover";
import { CONNECTORS, EFFORTS, MODELS, PERMISSIONS, PLUGINS, useComposerSettings, type Permission } from "./settings";

const ICON = { size: 18, strokeWidth: 1.75 } as const;
const TRAY_ICON = { size: 16, strokeWidth: 1.75 } as const;
const Blank = () => <span className="w-[18px] shrink-0" />;
const LEAD = "shrink-0 text-[var(--c-ink-2)]";

const CONNECTOR_ICONS: Record<string, LucideIcon> = {
  github: GitBranch,
  gdrive: HardDrive,
  gmail: Mail,
  notion: NotebookText,
};

export function ConnectorsMenu() {
  const [open, setOpen] = useState(false);
  const on = useComposerSettings((s) => s.connectors);
  const toggle = useComposerSettings((s) => s.toggleConnector);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      panel={
        <div>
          <p className="px-2 pt-1.5 pb-1 text-[12px] text-[var(--c-ink-3)]">Connectors</p>
          {CONNECTORS.map((c) => {
            const Icon = CONNECTOR_ICONS[c.id] ?? Plus;
            const enabled = Boolean(on[c.id]);
            return (
              <button key={c.id} type="button" role="menuitemcheckbox" aria-checked={enabled} className={menuItem} onClick={() => toggle(c.id)}>
                <Icon {...ICON} className="shrink-0 text-[var(--c-ink-2)]" />
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {enabled ? <Check {...ICON} /> : <Blank />}
              </button>
            );
          })}
        </div>
      }
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Connectors"
        title="Connectors"
        onClick={() => setOpen((o) => !o)}
        className={`grid h-8 w-8 place-items-center rounded-lg text-[var(--c-ink-2)] hover:bg-[var(--c-hover)] hover:text-[var(--c-ink)] focus-visible:outline-none ${open ? "bg-[var(--c-hover)] text-[var(--c-ink)]" : ""}`}
      >
        <Plus {...ICON} />
      </button>
    </Popover>
  );
}

const PERM_ICONS: Record<Permission, LucideIcon> = { "read-only": Eye, ask: ShieldQuestion, approve: ShieldCheck };

function ShieldTerminal({ size = 16, strokeWidth = 1.75, className }: LucideProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 10 2.5 2L9 14" />
      <path d="M13 14h2.5" />
    </svg>
  );
}

export function PermissionsMenu() {
  const [open, setOpen] = useState(false);
  const value = useComposerSettings((s) => s.permission);
  const setPermission = useComposerSettings((s) => s.setPermission);
  const current = PERMISSIONS.find((p) => p.id === value) ?? PERMISSIONS[1];
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      panel={
        <div>
          {PERMISSIONS.map((p) => {
            const Icon = PERM_ICONS[p.id];
            const selected = p.id === value;
            return (
              <button
                key={p.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                title={p.hint}
                className={menuItem}
                onClick={() => {
                  setPermission(p.id);
                  setOpen(false);
                }}
              >
                <Icon {...ICON} className="shrink-0 text-[var(--c-ink-2)]" />
                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                {selected ? <Check {...ICON} /> : <Blank />}
              </button>
            );
          })}
        </div>
      }
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Permissions: ${current.label}`}
        title={current.label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 max-w-[200px] items-center gap-1.5 rounded-lg px-2 text-[14px] text-[var(--c-ink-2)] hover:bg-[var(--c-hover)] hover:text-[var(--c-ink)] focus-visible:outline-none"
      >
        <ShieldTerminal className="shrink-0" />
        <span className="truncate">{current.label}</span>
      </button>
    </Popover>
  );
}

export function ModelMenu() {
  const [open, setOpen] = useState(false);
  const value = useComposerSettings((s) => s.model);
  const setModel = useComposerSettings((s) => s.setModel);
  const effort = useComposerSettings((s) => s.effort);
  const setEffort = useComposerSettings((s) => s.setEffort);
  const current = MODELS.find((m) => m.id === value) ?? MODELS[0];
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="right"
      panel={
        <div>
          {MODELS.map((m) => {
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={menuItem}
                onClick={() => {
                  setModel(m.id);
                  setOpen(false);
                }}
              >
                <Sparkles {...ICON} className={LEAD} />
                <span className="min-w-0 flex-1 truncate">{m.label}</span>
                {selected ? <Check {...ICON} /> : <Blank />}
              </button>
            );
          })}
          <div aria-hidden="true" className="mx-2 my-1 h-px bg-[var(--c-line)]" />
          <p className="px-2 pt-1.5 pb-1 text-[12px] text-[var(--c-ink-3)]">Effort</p>
          {EFFORTS.map((e) => {
            const selected = e.id === effort;
            return (
              <button
                key={e.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={menuItem}
                onClick={() => {
                  setEffort(e.id);
                  setOpen(false);
                }}
              >
                <Blank />
                <span className="min-w-0 flex-1 truncate">{e.label}</span>
                {selected ? <Check {...ICON} /> : <Blank />}
              </button>
            );
          })}
        </div>
      }
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Model: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 max-w-[260px] items-center gap-1.5 rounded-lg px-2 text-[14px] hover:bg-[var(--c-hover)] focus-visible:outline-none"
      >
        <span className="truncate text-[var(--c-ink)]">{current.label}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[var(--c-ink-3)]">
          {EFFORTS.find((e) => e.id === effort)?.label ?? "Medium"}
          <ChevronDown size={12} strokeWidth={1.75} className="shrink-0" />
        </span>
      </button>
    </Popover>
  );
}

const trayBtn =
  "inline-flex h-8 items-center gap-2 rounded-lg px-2 text-[14px] font-normal text-[var(--c-ink-2)] hover:bg-[var(--c-hover)] hover:text-[var(--c-ink)] focus-visible:outline-none";

export function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const projects = useComposerSettings((s) => s.projects);
  const projectId = useComposerSettings((s) => s.projectId);
  const select = useComposerSettings((s) => s.selectProject);
  const create = useComposerSettings((s) => s.createProject);
  const current = projects.find((p) => p.id === projectId);

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

export function PluginsMenu() {
  const [open, setOpen] = useState(false);
  const plugins = useComposerSettings((s) => s.plugins);
  const toggle = useComposerSettings((s) => s.togglePlugin);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      side="down"
      panel={
        <div>
          {PLUGINS.map((p) => {
            const on = Boolean(plugins[p.id]);
            return (
              <button key={p.id} type="button" role="menuitemcheckbox" aria-checked={on} className={menuItem} onClick={() => toggle(p.id)}>
                <Blocks {...ICON} className={LEAD} />
                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                {on ? <Check {...ICON} /> : <Blank />}
              </button>
            );
          })}
        </div>
      }
    >
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Plugins" onClick={() => setOpen((o) => !o)} className={trayBtn}>
        <Blocks {...TRAY_ICON} className="shrink-0" />
        <span>Plugins</span>
      </button>
    </Popover>
  );
}
