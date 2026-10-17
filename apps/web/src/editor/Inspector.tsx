import { useEffect, useRef, useState, type ReactNode } from "react";
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
    <section className="border-t border-white/5 px-4 py-3 first:border-t-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{title}</h3>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-neutral-400">
      <span>{label}</span>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-white/10 bg-neutral-950/60 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-400/60";
const smallBtn =
  "rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-40";

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
    <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} className={`${inputCls} resize-y`} />
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
    <div className="flex rounded-md border border-white/10 bg-neutral-950/60 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded px-1.5 py-1 text-xs transition ${
            o.value === value ? "bg-indigo-500 text-white" : "text-neutral-400 hover:text-neutral-100"
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
    <div className="flex flex-wrap items-center gap-1.5">
      {swatches.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onPick(c)}
          className={`h-5 w-5 rounded-full border transition hover:scale-110 ${
            value?.toLowerCase() === c ? "border-white ring-2 ring-indigo-400" : "border-white/20"
          }`}
          style={{ background: c }}
        />
      ))}
      <label
        title="Custom color"
        className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-white/20"
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
        <button type="button" onClick={onReset} className="ml-auto text-[11px] text-neutral-500 hover:text-neutral-200">
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
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white text-neutral-800">
          {value ? <IconGlyph name={value} px={22} /> : <span className="text-[10px] text-neutral-400">none</span>}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-400" title={value ?? undefined}>
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
      <div className="grid max-h-44 grid-cols-6 gap-1 overflow-y-auto rounded-md bg-white p-1.5 text-neutral-800">
        {results.map((name) => (
          <button
            key={name}
            type="button"
            title={iconLabel(name)}
            onClick={() => onChange(name)}
            className={`flex aspect-square items-center justify-center rounded hover:bg-indigo-100 ${name === value ? "bg-indigo-100 ring-2 ring-indigo-400" : ""}`}
          >
            <IconGlyph name={name} px={22} />
          </button>
        ))}
        {!loading && results.length === 0 && (
          <p className="col-span-6 py-3 text-center text-[11px] text-neutral-400">{query ? "No icons found" : "Type to search"}</p>
        )}
        {loading && results.length === 0 && <p className="col-span-6 py-3 text-center text-[11px] text-neutral-400">Searching…</p>}
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
        <select value={href.slice(1)} onChange={(e) => setHref(`#${e.target.value}`)} className={inputCls}>
          {sectionTargets(screen).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
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
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
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
          <img src={src} alt="" className="h-10 w-10 rounded object-cover" />
          <span className="flex-1 text-[11px] text-neutral-400">Your upload</span>
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
            className={`h-7 w-7 overflow-hidden rounded border ${src === a.url ? "border-indigo-400" : "border-white/10"}`}
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
        className={`${inputCls} resize-y`}
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
              className="accent-indigo-500"
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
              <div key={i} className="flex flex-col gap-1 rounded-md border border-white/10 p-1.5">
                <TextInput value={item.question} onChange={(q) => livePatch(node.id, { items: node.items.map((it, j) => (j === i ? { ...it, question: q } : it)) })} />
                <TextInput multiline value={item.answer} onChange={(a) => livePatch(node.id, { items: node.items.map((it, j) => (j === i ? { ...it, answer: a } : it)) })} />
                <button type="button" className="self-end text-[11px] text-neutral-500 hover:text-rose-300" onClick={() => patch(node.id, { items: node.items.filter((_, j) => j !== i) })}>
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
      return <p className="text-xs text-neutral-500">A horizontal line. Change its color below.</p>;
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

const TEXTY = ["heading", "text", "button", "link", "badge", "list", "checkbox", "textbox", "select", "table", "accordion", "rating"];
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
            <div className="flex gap-1.5">
              <div className="flex-1">
                <Segmented
                  value={style.align ?? "auto"}
                  options={[{ value: "auto", label: "Auto" }, { value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]}
                  onChange={(v) => set({ align: v === "auto" ? null : (v as Style["align"]) })}
                />
              </div>
              <button type="button" onClick={() => set({ italic: !style.italic })} className={`${smallBtn} italic ${style.italic ? "bg-indigo-500 text-white" : ""}`}>
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
          <div className="flex gap-1.5">
            <div className="flex-1">
              <Segmented
                value={style.shadow ?? "none"}
                options={[{ value: "none", label: "None" }, { value: "sm", label: "Soft" }, { value: "md", label: "Lifted" }, { value: "lg", label: "Floating" }]}
                onChange={(v) => set({ shadow: v === "none" ? null : (v as Style["shadow"]) })}
              />
            </div>
            <button type="button" onClick={() => set({ border: !style.border })} className={`${smallBtn} ${style.border ? "bg-indigo-500 text-white" : ""}`} title="Outline">
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
          className="flex-1 accent-indigo-500"
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
    "flex flex-1 items-center justify-center gap-1 rounded-md border border-white/10 py-1.5 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-30";

  return (
    <>
      <div className="px-4 pb-2 pt-3">
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-neutral-500">
          <button type="button" className="hover:text-neutral-200" onClick={() => s.select(null)}>Page</button>
          {path.map((n) => (
            <span key={n.id} className="flex items-center gap-1">
              <span>/</span>
              <button type="button" onClick={() => s.select(n.id)} className={n.id === node.id ? "font-medium text-indigo-300" : "hover:text-neutral-200"}>
                {TYPE_LABELS[n.type]}
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <button type="button" title="Move up" className={action} disabled={index <= 0} onClick={() => s.move(node.id, parentId, index - 1)}><ArrowUpIcon /></button>
          <button type="button" title="Move down" className={action} disabled={index >= siblings.length - 1} onClick={() => s.move(node.id, parentId, index + 2)}><ArrowDownIcon /></button>
          <button type="button" title="Select the group around this" className={action} disabled={!parentId} onClick={() => parentId && s.select(parentId)}><ParentIcon /></button>
          <button type="button" title="Duplicate (⌘D)" className={action} onClick={() => s.duplicate(node.id)}><CopyIcon /></button>
          <button type="button" title="Delete" className={`${action} hover:border-rose-500/40 hover:text-rose-300`} onClick={() => s.remove(node.id)}><TrashIcon /></button>
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
          <div className="grid grid-cols-3 gap-1">
            {FONTS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setScreen({ ...screen, font: f })}
                className={`rounded-md border px-1 py-1.5 text-sm ${screen.font === f ? "border-indigo-400 bg-indigo-500/20 text-white" : "border-white/10 text-neutral-300 hover:bg-white/5"}`}
                style={{ fontFamily: FONT_FAMILY[f] }}
              >
                {FONT_LABELS[f]}
              </button>
            ))}
          </div>
        </Field>
      </Section>
      <Section title="Your files">
        <p className="text-xs leading-relaxed text-neutral-400">
          Upload your logo or photos, then select an image and pick them, or just ask the AI: “put my logo in the nav”.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {assets.map((a) => (
            <img key={a.url} src={a.url} alt={a.name} title={a.name} className="h-12 w-12 rounded-md border border-white/10 object-cover" />
          ))}
        </div>
        <UploadButton onUploaded={() => {}} label="Upload an image" />
      </Section>
      <Section title="How to edit">
        <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-neutral-400">
          <li><b className="text-neutral-200">Click</b> anything to select it and change it here.</li>
          <li><b className="text-neutral-200">Double-click</b> text to type over it.</li>
          <li><b className="text-neutral-200">Drag</b> an element to move it. Blue lines show where it lands.</li>
          <li><b className="text-neutral-200">Pull the blue handle</b> on the right edge to resize.</li>
          <li><b className="text-neutral-200">Type in the ✦ box</b> under a selected element to have the AI change just that element.</li>
          <li><b className="text-neutral-200">Preview</b> makes buttons and links work.</li>
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
      className="flex w-full shrink-0 flex-col overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900/70 backdrop-blur md:max-h-[calc(100vh-14rem)] md:w-80"
      onClick={(e) => e.stopPropagation()}
    >
      {node ? <NodePanel node={node} screen={screen} /> : <PagePanel screen={screen} />}
    </aside>
  );
}
