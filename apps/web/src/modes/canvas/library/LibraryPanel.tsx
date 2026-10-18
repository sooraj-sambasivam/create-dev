import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RotateCw, Search } from "lucide-react";
import { MotionPreview } from "./MotionPreview";
import { IconThumb } from "./IconThumb";
import { SEARCH_DEBOUNCE_MS, debounce, mostFailed, searchTerm } from "./search";
import { useCanvasStore } from "../canvasStore";
import { addLibraryItemToCanvas, iconUrl, setLibraryDrag, type LibraryDrag } from "./canvasDrop";
import { iconNode, insertIntoPage, photoNode } from "./insert";
import { SECTION_TEMPLATES } from "./templates";
import { MOTION_PRESET_IDS, PRESETS } from "../../../motion/presets";
import { useMotionStore } from "../../../motion/motionStore";
import { useScreenStore } from "../../../store/screenStore";
import { useWorkspaceStore } from "../../../store/workspaceStore";

type Tab = "icons" | "photos" | "sections" | "motion";
const TABS: { id: Tab; label: string }[] = [
  { id: "icons", label: "Icons" },
  { id: "photos", label: "Photos" },
  { id: "sections", label: "Sections" },
  { id: "motion", label: "Motion" },
];
const STYLES = ["line", "solid", "cartoon", "3d", "brand"] as const;
const PHOTO_SUGGESTIONS = ["modern office", "coffee shop", "mountain landscape", "team meeting", "abstract gradient", "city skyline"];

const chip = (on: boolean) =>
  `h-6 shrink-0 rounded-[6px] px-2 text-[12px] ${on ? "bg-hover text-ink" : "text-ink-2 hover:bg-hover"}`;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-8 items-center gap-2 rounded-[8px] border border-line bg-surface px-2 text-ink-2 focus-within:border-accent">
      <Search size={14} strokeWidth={1.75} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3" />
    </label>
  );
}

function onCanvasAdd(item: LibraryDrag) {
  const editor = useCanvasStore.getState().editor;
  if (editor) addLibraryItemToCanvas(editor, item);
}

function IconsTab() {
  const [q, setQ] = useState("");
  const [style, setStyle] = useState<(typeof STYLES)[number]>("line");
  const [icons, setIcons] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const dq = useDebounced(q.trim(), 250);
  const [round, setRound] = useState(0);
  const [stats, setStats] = useState({ failed: 0, total: 0 });
  const settle = useCallback((ok: boolean) => setStats((s) => ({ failed: s.failed + (ok ? 0 : 1), total: s.total + 1 })), []);
  const broken = mostFailed(stats.failed, stats.total);
  useEffect(() => {
    setStats({ failed: 0, total: 0 });
    if (!dq) {
      setIcons([]);
      return;
    }
    const ctl = new AbortController();
    setBusy(true);
    fetch(`/api/icons/search?q=${encodeURIComponent(dq)}&style=${style}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { icons: [] }))
      .then((d: { icons?: string[] }) => setIcons(Array.isArray(d.icons) ? d.icons : []))
      .catch(() => {})
      .finally(() => setBusy(false));
    return () => ctl.abort();
  }, [dq, style, round]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <SearchBox value={q} onChange={setQ} placeholder="Search icons" />
      <div className="flex gap-1 overflow-x-auto">
        {STYLES.map((s) => (
          <button key={s} type="button" className={chip(style === s)} onClick={() => setStyle(s)}>{s}</button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-4 content-start gap-1 overflow-y-auto">
        {icons.map((name) => (
          <button
            key={name}
            type="button"
            title={name}
            draggable
            onDragStart={(e) => setLibraryDrag(e, { libraryKind: "icon", value: name, label: name })}
            onClick={() => insertIntoPage([iconNode(name)], `Added icon ${name}`)}
            onDoubleClick={() => onCanvasAdd({ libraryKind: "icon", value: name, label: name })}
            className="flex aspect-square items-center justify-center rounded-[8px] text-ink-2 hover:bg-hover"
          >
            <IconThumb name={name} px={24} onSettled={settle} />
          </button>
        ))}
      </div>
      {broken && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-[8px] border border-line bg-tray px-2 py-1.5 text-[12px] text-ink-2">
          <span>Couldn't load icons.</span>
          <button type="button" onClick={() => setRound((r) => r + 1)} className="inline-flex h-6 items-center gap-1 rounded-[6px] px-2 text-ink hover:bg-hover">
            <RotateCw size={14} strokeWidth={1.75} aria-hidden /> Retry
          </button>
        </div>
      )}
      {!icons.length && <p className="text-[12px] text-ink-3">{busy ? "Searching…" : dq ? "No icons found." : "Type a word, like cart or heart."}</p>}
      <p className="text-[12px] text-ink-3">Click to add to the page. Drag onto the canvas.</p>
    </div>
  );
}

function PhotosTab() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);

  const search = useCallback(async (t: string) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    try {
      const urls = await Promise.all(
        [t, `${t} 2`, `${t} 3`, `${t} 4`].map(async (v, i) => {
          const r = await fetch(`/api/image/resolve?q=${encodeURIComponent(t)}&seed=${encodeURIComponent(`${v}-${i}`)}`, { signal: c.signal });
          const d = (await r.json()) as { url?: string };
          return d.url ?? "";
        }),
      );
      if (c.signal.aborted) return;
      setResults([...new Set(urls)].filter((u) => u.startsWith("https://")).map((url) => ({ q: t, url })));
      setSearched(t);
    } catch {
      if (c.signal.aborted) return;
      setResults([]);
      setSearched(t);
    } finally {
      if (ctl.current === c) setBusy(false);
    }
  }, []);

  const debounced = useMemo(() => debounce((t: string) => void search(t), SEARCH_DEBOUNCE_MS), [search]);
  useEffect(() => () => { debounced.cancel(); ctl.current?.abort(); }, [debounced]);

  function onChange(v: string) {
    setQ(v);
    if (searchTerm(v)) debounced(searchTerm(v)!);
    else {
      debounced.cancel();
      ctl.current?.abort();
      setBusy(false);
      setResults([]);
      setSearched(null);
    }
  }
  function now(v: string) {
    const t = searchTerm(v);
    if (!t) return;
    debounced.cancel();
    void search(t);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <form onSubmit={(e) => { e.preventDefault(); now(q); }}>
        <SearchBox value={q} onChange={onChange} placeholder="Search photos" />
      </form>
      <div className="flex flex-wrap gap-1">
        {PHOTO_SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="h-6 rounded-[6px] border border-line px-2 text-[12px] text-ink-2 hover:bg-hover" onClick={() => { setQ(s); now(s); }}>{s}</button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto">
        {results.map((r) => (
          <button
            key={r.url}
            type="button"
            draggable
            onDragStart={(e) => setLibraryDrag(e, { libraryKind: "photo", value: r.url, label: r.q })}
            onClick={() => insertIntoPage([photoNode(r.url, r.q)], "Added photo")}
            onDoubleClick={() => onCanvasAdd({ libraryKind: "photo", value: r.url, label: r.q })}
            className="overflow-hidden rounded-[8px] border border-line"
          >
            <img src={r.url} alt={r.q} loading="lazy" className="aspect-video w-full object-cover" />
          </button>
        ))}
      </div>
      {busy && (
        <p role="status" className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <Loader2 size={14} strokeWidth={1.75} className="animate-spin motion-reduce:animate-none" aria-hidden /> Searching…
        </p>
      )}
      {!busy && searched && results.length === 0 && <p className="text-[12px] text-ink-3">No photos found for "{searched}".</p>}
      {!busy && !searched && <p className="text-[12px] text-ink-3">Type at least 2 letters to search.</p>}
    </div>
  );
}

function SectionsTab() {
  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
      {SECTION_TEMPLATES.map((t) => (
        <li key={t.id}>
          <button type="button" onClick={() => insertIntoPage(structuredClone(t.nodes), `Added ${t.label} section`)} className="flex w-full flex-col rounded-[8px] px-2 py-2 text-left hover:bg-hover">
            <span className="text-[14px] text-ink">{t.label}</span>
            <span className="text-[12px] text-ink-3">{t.description}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MotionTab() {
  const selectedId = useScreenStore((s) => s.selectedId);
  const chatId = useWorkspaceStore((s) => s.activeChatId);
  const setPreset = useMotionStore((s) => s.setPreset);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      <p className="text-[12px] text-ink-3">{selectedId ? "Click a preset to apply it to the selected element." : "Select an element, then pick a preset."}</p>
      <div className="grid grid-cols-2 gap-2">
        {MOTION_PRESET_IDS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={!selectedId || !chatId}
            onClick={() => selectedId && chatId && setPreset(chatId, selectedId, p)}
            className="flex flex-col items-center gap-2 rounded-[8px] border border-line p-2 text-[12px] text-ink-2 hover:bg-hover disabled:opacity-60"
          >
            <MotionPreview preset={p} />
            {PRESETS[p].label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LibraryPanel() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("icons");
  if (!open) {
    return (
      <button type="button" aria-label="Open library" onClick={() => setOpen(true)} className="flex h-8 w-8 items-center justify-center self-start rounded-[8px] text-ink-2 hover:bg-hover">
        <ChevronRight size={18} strokeWidth={1.75} />
      </button>
    );
  }
  return (
    <aside aria-label="Library" className="flex h-full w-[260px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        <div role="tablist" className="flex gap-0.5">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" onClick={() => setTab(t.id)} className={`h-8 rounded-[8px] px-2 text-[14px] ${tab === t.id ? "text-ink" : "text-ink-3 hover:bg-hover"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" aria-label="Collapse library" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-2 hover:bg-hover">
          <ChevronLeft size={18} strokeWidth={1.75} />
        </button>
      </div>
      {tab === "icons" && <IconsTab />}
      {tab === "photos" && <PhotosTab />}
      {tab === "sections" && <SectionsTab />}
      {tab === "motion" && <MotionTab />}
    </aside>
  );
}
