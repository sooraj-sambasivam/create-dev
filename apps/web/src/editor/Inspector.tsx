import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  FONTS,
  childrenOf,
  findParentId,
  updateNode,
  updateStyle,
  walkNodes,
  type Container,
  type Node,
  type Screen,
  type Style,
} from "@create/shared";
import { useScreenStore } from "../store/screenStore";
import { TYPE_LABELS } from "./EditorContext";
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, ParentIcon, TrashIcon } from "./icons";
import { FONT_FAMILY, IconGlyph } from "../components/elements";

// ---- live editing: one undo step per focus session, not per keystroke ----

let sessionOpen = false;
const beginSession = () => {
  sessionOpen = false;
};
function liveApply(fn: (screen: Screen) => Screen) {
  const s = useScreenStore.getState();
  if (!s.screen) return;
  if (!sessionOpen) {
    s.snapshot();
    sessionOpen = true;
  }
  s.replaceLive(fn(s.screen));
}
const livePatch = (id: string, patch: Partial<Node>) => liveApply((screen) => updateNode(screen, id, patch));
const liveStyle = (id: string, patch: Partial<Style>) => liveApply((screen) => updateStyle(screen, id, patch));
const patch = (id: string, p: Partial<Node>) => useScreenStore.getState().patchNode(id, p);
const patchStyle = (id: string, p: Partial<Style>) => useScreenStore.getState().patchStyle(id, p);

// ---- primitives ----

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-sm font-medium text-ink">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 text-xs text-ink-2">
      <span>{label}</span>
      {children}
    </div>
  );
}

const inputCls =
  "h-8 w-full rounded-md border border-line bg-surface px-2.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent";
const smallBtn =
  "inline-flex h-8 items-center justify-center rounded-md border border-line px-3 text-sm text-ink transition-colors duration-150 hover:bg-hover disabled:opacity-40";

function TextInput({
  value,
  onChange,
  multiline,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const common = { value, placeholder, onFocus: beginSession, onBlur: beginSession };
  return multiline ? (
    <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} className={`${inputCls} h-auto min-h-16 resize-y py-1.5`} />
  ) : (
    <input {...common} type="text" onChange={(e) => onChange(e.target.value)} className={inputCls} />
  );
}

/** Text field bound to one node property, editing live with a single undo step. */
function Prop({ node, field, multiline, placeholder }: { node: Node; field: string; multiline?: boolean; placeholder?: string }) {
  const value = String((node as Record<string, unknown>)[field] ?? "");
  return (
    <TextInput
      value={value}
      multiline={multiline}
      placeholder={placeholder}
      onChange={(v) => livePatch(node.id, { [field]: v } as Partial<Node>)}
    />
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`h-8 min-w-10 flex-1 rounded-md px-2.5 text-xs transition-colors duration-150 ${
            o.value === value ? "bg-hover font-medium text-ink" : "text-ink-2 hover:bg-tray hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SWATCHES = [
  "#111827", "#ffffff", "#6b7280", "#4f46e5", "#2563eb", "#0891b2",
  "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#7c3aed",
];

function ColorPicker({ value, onPick, onLive, onReset }: { value: string | null | undefined; onPick: (c: string) => void; onLive: (c: string) => void; onReset?: () => void }) {
  // The current color (e.g. the brand color the AI picked) stays one click away after trying others.
  const [original] = useState(value ?? null);
  const swatches = [...new Set([original, value, ...SWATCHES].filter((c): c is string => Boolean(c)).map((c) => c.toLowerCase()))];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {swatches.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onPick(c)}
          className={`size-4 rounded-full border border-line outline-1 -outline-offset-1 outline-ink/15 transition-transform duration-150 hover:scale-110 ${
            value?.toLowerCase() === c ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""
          }`}
          style={{ background: c }}
        />
      ))}
      <label
        title="Custom color"
        className="relative size-4 cursor-pointer overflow-hidden rounded-full border border-line opacity-70 transition-opacity duration-150 hover:opacity-100"
        style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
      >
        <input
          type="color"
          value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#4f46e5"}
          onFocus={beginSession}
          onBlur={beginSession}
          onChange={(e) => onLive(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      {value && onReset && (
        <button type="button" onClick={onReset} className="ml-auto text-xs text-ink-3 transition-colors duration-150 hover:text-ink">
          Reset
        </button>
      )}
    </div>
  );
}

function StyleColor({ node, label, field }: { node: Node; label: string; field: "color" | "background" | "gradientTo" }) {
  const value = node.style?.[field];
  return (
    <Field label={label}>
      <ColorPicker
        value={value}
        onPick={(c) => patchStyle(node.id, { [field]: c })}
        onLive={(c) => liveStyle(node.id, { [field]: c })}
        onReset={() => patchStyle(node.id, { [field]: null })}
      />
    </Field>
  );
}

// ---- rich fields ----

const STYLE_OF_SET: Record<string, string> = {
  lucide: "line", tabler: "line", ph: "line", mdi: "solid", "fa6-solid": "solid", "heroicons-solid": "solid",
  "fluent-emoji-flat": "cartoon", "flat-color-icons": "cartoon", noto: "cartoon", "fluent-emoji": "3D",
  logos: "brand", "simple-icons": "brand",
};

function iconLabel(name: string): string {
  const [set, icon] = name.split(":");
  const style = STYLE_OF_SET[set];
  return `${(icon ?? name).replace(/-/g, " ")}${style ? ` (${style} style)` : ""}`;
}

const ICON_STYLES = [
  { value: "line", label: "Line" },
  { value: "solid", label: "Solid" },
  { value: "cartoon", label: "Cartoon" },
  { value: "3d", label: "3D" },
  { value: "brand", label: "Brand" },
] as const;

function IconPicker({ value, onChange, allowNone }: { value: string | null | undefined; onChange: (name: string | null) => void; allowNone?: boolean }) {
  const [query, setQuery] = useState(value?.split(":")[1]?.replace(/-/g, " ") ?? "");
  const [style, setStyle] = useState<(typeof ICON_STYLES)[number]["value"]>("line");
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/icons/search?q=${encodeURIComponent(q)}&style=${style}`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<{ icons: string[] }>)
        .then((d) => setResults(d.icons ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, style]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-tray text-ink">
          {value ? <IconGlyph name={value} px={22} /> : <span aria-hidden className="size-1 rounded-full bg-ink-3" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-2" title={value ?? undefined}>
          {value ? iconLabel(value) : "No icon"}
        </span>
        {allowNone && value && (
          <button type="button" className={smallBtn} onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search icons: cart, coffee, instagram…"
        className={inputCls}
      />
      <Segmented value={style} options={ICON_STYLES.map((s) => ({ value: s.value, label: s.label }))} onChange={setStyle} />
      <div className="grid max-h-44 grid-cols-6 gap-1 overflow-y-auto rounded-lg bg-tray p-1 text-ink">
        {results.map((name) => (
          <button
            key={name}
            type="button"
            title={iconLabel(name)}
            onClick={() => onChange(name)}
            className={`flex aspect-square items-center justify-center rounded-md transition-colors duration-150 hover:bg-hover ${name === value ? "bg-hover ring-1 ring-ink-3" : ""}`}
          >
            <IconGlyph name={name} px={22} />
          </button>
        ))}
        {!loading && results.length === 0 && (
          <p className="col-span-6 py-2 text-center text-xs text-ink-3">{query ? "No icons found" : "Type to search"}</p>
        )}
        {loading && results.length === 0 && <p className="col-span-6 py-3 text-center text-xs text-ink-3">Searching…</p>}
      </div>
    </div>
  );
}

function sectionTargets(screen: Screen): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const firstHeading = (n: Node): string | null => {
    let h: string | null = null;
    walkNodes([n], (c) => {
      if (!h && c.type === "heading") h = c.text;
    });
    return h;
  };
  for (const n of screen.children) out.push({ id: n.id, label: firstHeading(n) ?? TYPE_LABELS[n.type] });
  return out;
}

function LinkField({ node, screen }: { node: Node & { href?: string | null }; screen: Screen }) {
  const href = node.href ?? "";
  const kind = !href ? "none" : href.startsWith("#") ? "section" : href.startsWith("mailto:") ? "email" : href.startsWith("tel:") ? "phone" : "web";
  const setHref = (v: string | null) => patch(node.id, { href: v } as Partial<Node>);
  const liveHref = (v: string) => livePatch(node.id, { href: v } as Partial<Node>);
  return (
    <Field label="Goes to">
      <Segmented
        value={kind}
        options={[
          { value: "none", label: "Nothing" },
          { value: "section", label: "Section" },
          { value: "web", label: "Website" },
          { value: "email", label: "Email" },
          { value: "phone", label: "Phone" },
        ]}
        onChange={(k) =>
          setHref(
            k === "none" ? null : k === "section" ? `#${screen.children[0]?.id ?? "top"}` : k === "email" ? "mailto:hello@example.com" : k === "phone" ? "tel:+15555550123" : "https://",
          )
        }
      />
      {kind === "section" && (
        <div className="relative">
        <select value={href.slice(1)} onChange={(e) => setHref(`#${e.target.value}`)} className={`${inputCls} appearance-none pr-8`}>
          {sectionTargets(screen).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute right-2.5 top-2 text-ink-3" />
        </div>
      )}
      {kind === "web" && <TextInput value={href} onChange={liveHref} placeholder="https://instagram.com/yourpage" />}
      {kind === "email" && <TextInput value={href.replace(/^mailto:/, "")} onChange={(v) => liveHref(`mailto:${v}`)} placeholder="you@example.com" />}
      {kind === "phone" && <TextInput value={href.replace(/^tel:/, "")} onChange={(v) => liveHref(`tel:${v}`)} placeholder="+1 555 555 0123" />}
    </Field>
  );
}

function UploadButton({ onUploaded, label = "Upload your own" }: { onUploaded: (url: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <button type="button" className={smallBtn} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? "Uploading…" : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            const asset = await useScreenStore.getState().uploadAsset(file);
            onUploaded(asset.url);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed.");
          } finally {
            setBusy(false);
          }
        }}
      />
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}

/** Photo source for images, avatars and container backgrounds: stock search or the user's upload. */
function PhotoField({ node, srcField, queryField, label }: { node: Node; srcField: "src" | "bgSrc"; queryField: "query" | "bgQuery"; label: string }) {
  const rec = node as Record<string, unknown>;
  const src = rec[srcField] as string | null | undefined;
  const assets = useScreenStore((s) => s.assets);
  return (
    <Field label={label}>
      {src ? (
        <div className="flex items-center gap-2">
          <img src={src} alt="" className="size-10 rounded-md object-cover" />
          <span className="flex-1 text-xs text-ink-2">Your upload</span>
          <button type="button" className={smallBtn} onClick={() => patch(node.id, { [srcField]: null } as Partial<Node>)}>
            Use stock photo
          </button>
        </div>
      ) : (
        <TextInput
          value={String(rec[queryField] ?? "")}
          onChange={(v) => livePatch(node.id, { [queryField]: v } as Partial<Node>)}
          placeholder="Search photos: latte art, mountain lake…"
        />
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <UploadButton onUploaded={(url) => patch(node.id, { [srcField]: url } as Partial<Node>)} />
        {assets.map((a) => (
          <button
            key={a.url}
            type="button"
            title={`Use ${a.name}`}
            onClick={() => patch(node.id, { [srcField]: a.url } as Partial<Node>)}
            className={`size-8 overflow-hidden rounded-md border ${src === a.url ? "border-ink ring-1 ring-ink" : "border-line"}`}
          >
            <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </Field>
  );
}

function LinesField({ label, items, onChange }: { label: string; items: string[]; onChange: (items: string[]) => void }) {
  return (
    <Field label={label}>
      <textarea
        rows={Math.min(8, Math.max(3, items.length + 1))}
        value={items.join("\n")}
        onFocus={beginSession}
        onBlur={beginSession}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        className={`${inputCls} h-auto min-h-16 resize-y py-1.5`}
      />
    </Field>
  );
}

// ---- per-type panels ----

function ContentFields({ node, screen }: { node: Node; screen: Screen }) {
  switch (node.type) {
    case "heading":
      return (
        <>
          <Field label="Text"><Prop node={node} field="text" multiline /></Field>
          <Field label="Size">
            <Segmented value={node.level} options={[{ value: 1, label: "Large" }, { value: 2, label: "Medium" }, { value: 3, label: "Small" }]} onChange={(level) => patch(node.id, { level })} />
          </Field>
        </>
      );
    case "text":
      return (
        <>
          <Field label="Text"><Prop node={node} field="text" multiline /></Field>
          <Field label="Tone">
            <Segmented value={node.tone} options={[{ value: "default", label: "Normal" }, { value: "muted", label: "Subtle" }]} onChange={(tone) => patch(node.id, { tone })} />
          </Field>
        </>
      );
    case "button":
      return (
        <>
          <Field label="Label"><Prop node={node} field="label" /></Field>
          <Field label="Style">
            <Segmented value={node.variant} options={[{ value: "primary", label: "Solid" }, { value: "secondary", label: "Outline" }, { value: "ghost", label: "Plain" }]} onChange={(variant) => patch(node.id, { variant })} />
          </Field>
          <LinkField node={node} screen={screen} />
          <Field label="Icon"><IconPicker value={node.icon} allowNone onChange={(icon) => patch(node.id, { icon })} /></Field>
        </>
      );
    case "link":
      return (
        <>
          <Field label="Text"><Prop node={node} field="text" placeholder="Leave empty for an icon-only link" /></Field>
          <LinkField node={node} screen={screen} />
          <Field label="Icon"><IconPicker value={node.icon} allowNone onChange={(icon) => patch(node.id, { icon })} /></Field>
        </>
      );
    case "icon":
      return (
        <>
          <Field label="Icon"><IconPicker value={node.name} onChange={(name) => name && patch(node.id, { name })} /></Field>
          <Field label="Size">
            <Segmented value={node.size} options={(["sm", "md", "lg", "xl", "2xl"] as const).map((v) => ({ value: v, label: v.toUpperCase() }))} onChange={(size) => patch(node.id, { size })} />
          </Field>
        </>
      );
    case "image":
      return (
        <>
          <PhotoField node={node} srcField="src" queryField="query" label="Photo" />
          <Field label="Description"><Prop node={node} field="alt" /></Field>
          <Field label="Size">
            <Segmented
              value={node.size}
              options={[{ value: "logo", label: "Logo" }, { value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "full", label: "Full" }]}
              onChange={(size) => patch(node.id, { size })}
            />
          </Field>
          <Field label="Shape (full size only)">
            <Segmented
              value={node.aspect}
              options={[{ value: "square", label: "Square" }, { value: "video", label: "Wide" }, { value: "wide", label: "Banner" }, { value: "portrait", label: "Tall" }]}
              onChange={(aspect) => patch(node.id, { aspect })}
            />
          </Field>
        </>
      );
    case "avatar":
      return (
        <>
          <Field label="Name"><Prop node={node} field="name" /></Field>
          <PhotoField node={node} srcField="src" queryField="query" label="Photo (empty search shows initials)" />
          <Field label="Size">
            <Segmented value={node.size} options={[{ value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }]} onChange={(size) => patch(node.id, { size })} />
          </Field>
        </>
      );
    case "data":
      return (
        <>
          <Field label="Route">
            <TextInput
              value={node.source.route}
              placeholder="/orders/today"
              onChange={(route) => livePatch(node.id, { source: { ...node.source, route } })}
            />
          </Field>
          <Field label="Field (dot path in the response)"><Prop node={node} field="field" placeholder="total" /></Field>
          <Field label="Format">
            <select value={node.format} onChange={(e) => patch(node.id, { format: e.target.value as typeof node.format })} className={`${inputCls} appearance-none pr-8`}>
              {[["text", "Text"], ["number", "Number (1,234)"], ["compact", "Compact (1.2K)"], ["currency", "Currency ($)"], ["date", "Date"]].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Label"><Prop node={node} field="label" placeholder="Orders today" /></Field>
          <Field label="Fallback (when unavailable)"><Prop node={node} field="fallback" placeholder="—" /></Field>
          <Field label="Refresh every (seconds, blank = once)">
            <input
              type="number" min={5} max={3600} value={node.refreshSec ?? ""}
              onFocus={beginSession} onBlur={beginSession}
              onChange={(e) => {
                const n = e.target.value === "" ? null : Math.min(3600, Math.max(5, Math.round(Number(e.target.value)) || 5));
                livePatch(node.id, { refreshSec: n });
              }}
              className={inputCls}
            />
          </Field>
        </>
      );
    case "badge":
      return <Field label="Text"><Prop node={node} field="text" /></Field>;
    case "list":
      return (
        <>
          <LinesField label="Items (one per line)" items={node.items} onChange={(items) => livePatch(node.id, { items })} />
          <Field label="Markers">
            <Segmented
              value={node.marker}
              options={[{ value: "bullet", label: "•" }, { value: "check", label: "✓" }, { value: "number", label: "1." }, { value: "none", label: "None" }]}
              onChange={(marker) => patch(node.id, { marker })}
            />
          </Field>
        </>
      );
    case "rating":
      return (
        <>
          <Field label={`Stars (${node.value.toFixed(1)})`}>
            <input
              type="range" min={0} max={5} step={0.1} value={node.value}
              onPointerDown={beginSession} onFocus={beginSession}
              onChange={(e) => livePatch(node.id, { value: Number(e.target.value) })}
              className="accent-ink-2"
            />
          </Field>
          <Field label="Label"><Prop node={node} field="label" placeholder="1,240 reviews" /></Field>
        </>
      );
    case "table":
      return (
        <>
          <Field label="Columns (separate with |)">
            <TextInput value={node.columns.join(" | ")} onChange={(v) => livePatch(node.id, { columns: v.split("|").map((c) => c.trim()) })} />
          </Field>
          <LinesField
            label="Rows (one per line, cells separated with |)"
            items={node.rows.map((r) => r.join(" | "))}
            onChange={(lines) => livePatch(node.id, { rows: lines.map((l) => l.split("|").map((c) => c.trim())) })}
          />
        </>
      );
    case "accordion":
      return (
        <Field label="Questions">
          <div className="flex flex-col gap-2">
            {node.items.map((item, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-line p-2">
                <TextInput value={item.question} onChange={(q) => livePatch(node.id, { items: node.items.map((it, j) => (j === i ? { ...it, question: q } : it)) })} />
                <TextInput multiline value={item.answer} onChange={(a) => livePatch(node.id, { items: node.items.map((it, j) => (j === i ? { ...it, answer: a } : it)) })} />
                <button type="button" className="self-end text-xs text-ink-3 transition-colors duration-150 hover:text-bad" onClick={() => patch(node.id, { items: node.items.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className={smallBtn} onClick={() => patch(node.id, { items: [...node.items, { question: "New question?", answer: "Answer." }] })}>
              Add question
            </button>
          </div>
        </Field>
      );
    case "video":
      return <Field label="YouTube or Vimeo link"><Prop node={node} field="url" placeholder="https://youtube.com/watch?v=…" /></Field>;
    case "map":
      return <Field label="Address"><Prop node={node} field="address" /></Field>;
    case "textbox":
      return (
        <>
          <Field label="Label"><Prop node={node} field="label" /></Field>
          <Field label="Placeholder"><Prop node={node} field="placeholder" /></Field>
          <Field label="Size">
            <Segmented value={node.multiline ? "multi" : "single"} options={[{ value: "single", label: "One line" }, { value: "multi", label: "Paragraph" }]} onChange={(v) => patch(node.id, { multiline: v === "multi" })} />
          </Field>
        </>
      );
    case "checkbox":
      return <Field label="Label"><Prop node={node} field="label" /></Field>;
    case "select":
      return (
        <>
          <Field label="Label"><Prop node={node} field="label" /></Field>
          <LinesField label="Options (one per line)" items={node.options} onChange={(options) => livePatch(node.id, { options })} />
        </>
      );
    case "divider":
      return <p className="text-xs text-ink-3">A horizontal line. Change its color below.</p>;
    case "spacer":
      return (
        <Field label="Space">
          <Segmented value={node.size} options={(["sm", "md", "lg", "xl"] as const).map((v) => ({ value: v, label: v.toUpperCase() }))} onChange={(size) => patch(node.id, { size })} />
        </Field>
      );
    case "container":
      return <LayoutFields node={node} />;
  }
}

function LayoutFields({ node }: { node: Container }) {
  const set = (p: Partial<Container>) => patch(node.id, p);
  return (
    <>
      <Field label="Arrange items">
        <Segmented value={node.direction} options={[{ value: "row", label: "Side by side" }, { value: "column", label: "Stacked" }]} onChange={(direction) => set({ direction })} />
      </Field>
      {node.direction === "row" && (
        <Field label="Layout">
          <Segmented value={node.wrap ? "wrap" : "squeeze"} options={[{ value: "squeeze", label: "One line" }, { value: "wrap", label: "Grid (wraps)" }]} onChange={(v) => set({ wrap: v === "wrap" })} />
        </Field>
      )}
      <Field label="Space between items">
        <Segmented value={node.gap} options={[{ value: "none", label: "None" }, { value: "sm", label: "Tight" }, { value: "md", label: "Normal" }, { value: "lg", label: "Roomy" }]} onChange={(gap) => set({ gap })} />
      </Field>
      <Field label="Space inside the edges">
        <Segmented
          value={node.padding}
          options={[{ value: "none", label: "None" }, { value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }, { value: "xl", label: "Huge" }]}
          onChange={(padding) => set({ padding })}
        />
      </Field>
      <Field label={node.direction === "row" ? "Vertical alignment" : "Horizontal alignment"}>
        <Segmented
          value={node.align}
          options={[
            { value: "start", label: node.direction === "row" ? "Top" : "Left" },
            { value: "center", label: "Center" },
            { value: "end", label: node.direction === "row" ? "Bottom" : "Right" },
            { value: "stretch", label: "Fill" },
          ]}
          onChange={(align) => set({ align })}
        />
      </Field>
      <Field label={node.direction === "row" ? "Horizontal position" : "Vertical position"}>
        <Segmented
          value={node.justify}
          options={[{ value: "start", label: "Start" }, { value: "center", label: "Center" }, { value: "end", label: "End" }, { value: "between", label: "Spread" }]}
          onChange={(justify) => set({ justify })}
        />
      </Field>
      <Field label="Background">
        <Segmented
          value={node.background}
          options={[{ value: "none", label: "None" }, { value: "surface", label: "Card" }, { value: "muted", label: "Soft" }, { value: "accent", label: "Brand" }]}
          onChange={(background) => set({ background })}
        />
      </Field>
      <PhotoField node={node} srcField="bgSrc" queryField="bgQuery" label="Background photo" />
      {(node.bgSrc || node.bgQuery) && (
        <Field label="Photo tint">
          <Segmented value={node.overlay} options={[{ value: "none", label: "None" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} onChange={(overlay) => set({ overlay })} />
        </Field>
      )}
    </>
  );
}

const TEXTY = ["heading", "text", "button", "link", "badge", "list", "checkbox", "textbox", "select", "table", "accordion", "rating", "data"];
const PHOTOGRAPHIC = ["image", "avatar", "icon", "container"];

function StyleFields({ node }: { node: Node }) {
  const style = node.style ?? {};
  const set = (p: Partial<Style>) => patchStyle(node.id, p);
  return (
    <>
      {(TEXTY.includes(node.type) || node.type === "icon" || node.type === "container") && <StyleColor node={node} label={node.type === "icon" ? "Icon color" : "Text color"} field="color" />}
      {node.type === "divider" && <StyleColor node={node} label="Line color" field="color" />}
      {!["divider", "spacer", "icon"].includes(node.type) && <StyleColor node={node} label="Background" field="background" />}
      {style.background && <StyleColor node={node} label="Fade background into (gradient)" field="gradientTo" />}
      {TEXTY.includes(node.type) && (
        <>
          <Field label="Text size">
            <Segmented
              value={style.fontSize ?? "auto"}
              options={[{ value: "auto", label: "Auto" }, ...(["sm", "lg", "2xl", "4xl", "5xl"] as const).map((v) => ({ value: v, label: v.toUpperCase() }))]}
              onChange={(v) => set({ fontSize: v === "auto" ? null : (v as Style["fontSize"]) })}
            />
          </Field>
          <Field label="Weight">
            <Segmented
              value={style.weight ?? "auto"}
              options={[{ value: "auto", label: "Auto" }, { value: "normal", label: "Regular" }, { value: "semibold", label: "Semi" }, { value: "bold", label: "Bold" }, { value: "black", label: "Heavy" }]}
              onChange={(v) => set({ weight: v === "auto" ? null : (v as Style["weight"]) })}
            />
          </Field>
          <Field label="Align and emphasis">
            <div className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <Segmented
                  value={style.align ?? "auto"}
                  options={[{ value: "auto", label: "Auto" }, { value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]}
                  onChange={(v) => set({ align: v === "auto" ? null : (v as Style["align"]) })}
                />
              </div>
              <button type="button" onClick={() => set({ italic: !style.italic })} className={`${smallBtn} size-8 shrink-0 px-0 italic ${style.italic ? "!bg-hover font-medium" : ""}`} aria-pressed={!!style.italic}>
                I
              </button>
            </div>
          </Field>
        </>
      )}
      {!["spacer", "divider"].includes(node.type) && (
        <Field label="Corners">
          <Segmented
            value={style.radius ?? "auto"}
            options={[{ value: "auto", label: "Auto" }, { value: "none", label: "Sharp" }, { value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "full", label: "Pill" }]}
            onChange={(v) => set({ radius: v === "auto" ? null : (v as Style["radius"]) })}
          />
        </Field>
      )}
      {!["spacer", "divider"].includes(node.type) && (
        <Field label="Shadow and outline">
          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <Segmented
                value={style.shadow ?? "none"}
                options={[{ value: "none", label: "None" }, { value: "sm", label: "Soft" }, { value: "md", label: "Lifted" }, { value: "lg", label: "Floating" }]}
                onChange={(v) => set({ shadow: v === "none" ? null : (v as Style["shadow"]) })}
              />
            </div>
            <button type="button" onClick={() => set({ border: !style.border })} className={`${smallBtn} size-8 shrink-0 px-0 ${style.border ? "!bg-hover font-medium" : ""}`} aria-pressed={!!style.border} title="Outline">
              ▢
            </button>
          </div>
        </Field>
      )}
      {PHOTOGRAPHIC.includes(node.type) && (
        <Field label="Photo effect">
          <Segmented
            value={style.filter ?? "none"}
            options={[{ value: "none", label: "None" }, { value: "grayscale", label: "Grey" }, { value: "sepia", label: "Sepia" }]}
            onChange={(v) => set({ filter: v === "none" ? null : (v as Style["filter"]) })}
          />
        </Field>
      )}
      <WidthField node={node} />
    </>
  );
}

function WidthField({ node }: { node: Node }) {
  const pct = node.widthPct ?? null;
  return (
    <Field label={`Width ${pct === null ? "(automatic)" : `${pct}%`}`}>
      <div className="flex items-center gap-2">
        <input
          type="range" min={10} max={100} step={5} value={pct ?? 100}
          onPointerDown={beginSession} onFocus={beginSession}
          onChange={(e) => livePatch(node.id, { widthPct: Number(e.target.value) })}
          className="flex-1 accent-ink-2"
        />
        <button type="button" disabled={pct === null} onClick={() => patch(node.id, { widthPct: null })} className={smallBtn}>
          Auto
        </button>
      </div>
    </Field>
  );
}

function pathTo(screen: Screen, id: string): Node[] {
  const parents = new Map<string, string | null>();
  const byId = new Map<string, Node>();
  walkNodes(screen.children, (n, parentId) => {
    parents.set(n.id, parentId);
    byId.set(n.id, n);
  });
  const path: Node[] = [];
  let cur: string | null | undefined = id;
  while (cur) {
    const n = byId.get(cur);
    if (!n) break;
    path.unshift(n);
    cur = parents.get(cur);
  }
  return path;
}

function NodePanel({ node, screen }: { node: Node; screen: Screen }) {
  const s = useScreenStore.getState();
  const parentId = findParentId(screen, node.id) ?? null;
  const siblings = childrenOf(screen, parentId);
  const index = siblings.findIndex((n) => n.id === node.id);
  const path = pathTo(screen, node.id);
  const action =
    "flex size-8 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <>
      <div className="pb-4">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-3">
          <button type="button" className="transition-colors duration-150 hover:text-ink" onClick={() => s.select(null)}>Page</button>
          {path.map((n) => (
            <span key={n.id} className="flex items-center gap-1">
              <span aria-hidden>/</span>
              <button type="button" onClick={() => s.select(n.id)} className={n.id === node.id ? "font-medium text-ink" : "transition-colors duration-150 hover:text-ink"}>
                {TYPE_LABELS[n.type]}
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1">
          <button type="button" title="Move up" aria-label="Move up" className={action} disabled={index <= 0} onClick={() => s.move(node.id, parentId, index - 1)}><ArrowUpIcon /></button>
          <button type="button" title="Move down" aria-label="Move down" className={action} disabled={index >= siblings.length - 1} onClick={() => s.move(node.id, parentId, index + 2)}><ArrowDownIcon /></button>
          <button type="button" title="Select the group around this" aria-label="Select the group around this" className={action} disabled={!parentId} onClick={() => parentId && s.select(parentId)}><ParentIcon /></button>
          <button type="button" title="Duplicate (⌘D)" aria-label="Duplicate (⌘D)" className={action} onClick={() => s.duplicate(node.id)}><CopyIcon /></button>
          <button type="button" title="Delete" aria-label="Delete" className={`${action} ml-auto hover:!text-bad`} onClick={() => s.remove(node.id)}><TrashIcon /></button>
        </div>
      </div>
      <Section title={node.type === "container" ? "Layout" : "Content"}>
        <ContentFields node={node} screen={screen} />
      </Section>
      <Section title="Look">
        <StyleFields node={node} />
      </Section>
    </>
  );
}

const FONT_LABELS: Record<string, string> = {
  sans: "Modern", serif: "Elegant", display: "Bold", rounded: "Friendly", mono: "Code", handwritten: "Playful",
};

function PagePanel({ screen }: { screen: Screen }) {
  const setScreen = useScreenStore((s) => s.setScreen);
  const assets = useScreenStore((s) => s.assets);
  return (
    <>
      <Section title="Page">
        <Field label="Title">
          <TextInput value={screen.title} onChange={(v) => liveApply((sc) => ({ ...sc, title: v }))} />
        </Field>
        <Field label="Theme">
          <Segmented value={screen.theme} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} onChange={(theme) => setScreen({ ...screen, theme })} />
        </Field>
        <Field label="Brand color">
          <ColorPicker
            value={screen.accent}
            onPick={(c) => setScreen({ ...screen, accent: c })}
            onLive={(c) => liveApply((sc) => ({ ...sc, accent: c }))}
          />
        </Field>
        <Field label="Font">
          <div className="grid grid-cols-3 gap-1.5">
            {FONTS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setScreen({ ...screen, font: f })}
                className={`h-8 rounded-lg border px-1 text-sm transition-colors duration-150 ${screen.font === f ? "border-ink bg-ink text-surface" : "border-line text-ink hover:bg-hover"}`}
                style={{ fontFamily: FONT_FAMILY[f] }}
              >
                {FONT_LABELS[f]}
              </button>
            ))}
          </div>
        </Field>
      </Section>
      <Section title="Your files">
        <p className="text-xs leading-relaxed text-ink-2">
          Upload your logo or photos, then select an image and pick them, or just ask the AI: “put my logo in the nav”.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {assets.map((a) => (
            <img key={a.url} src={a.url} alt={a.name} title={a.name} className="size-12 rounded-lg border border-line object-cover" />
          ))}
        </div>
        <UploadButton onUploaded={() => {}} label="Upload an image" />
      </Section>
      <Section title="How to edit">
        <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-ink-2">
          <li><b className="font-medium text-ink">Click</b> anything to select it and change it here.</li>
          <li><b className="font-medium text-ink">Double-click</b> text to type over it.</li>
          <li><b className="font-medium text-ink">Drag</b> an element to move it. Blue lines show where it lands.</li>
          <li><b className="font-medium text-ink">Pull the blue handle</b> on the right edge to resize.</li>
          <li><b className="font-medium text-ink">Type in the ✦ box</b> under a selected element to have the AI change just that element.</li>
          <li><b className="font-medium text-ink">Preview</b> makes buttons and links work.</li>
          <li>⌘Z undo · ⌘⇧Z redo · ⌘D duplicate · Delete removes</li>
        </ul>
      </Section>
    </>
  );
}

export function Inspector() {
  const screen = useScreenStore((s) => s.screen);
  const selectedId = useScreenStore((s) => s.selectedId);
  if (!screen) return null;
  let node: Node | null = null;
  if (selectedId) walkNodes(screen.children, (n) => { if (n.id === selectedId) node = n; });
  return (
    <aside
      className="flex w-full flex-col text-sm text-ink"
      onClick={(e) => e.stopPropagation()}
    >
      {node ? <NodePanel node={node} screen={screen} /> : <PagePanel screen={screen} />}
    </aside>
  );
}
