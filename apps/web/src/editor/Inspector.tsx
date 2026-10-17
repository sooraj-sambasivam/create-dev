import type { ReactNode } from "react";
import {
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
    <label className="flex flex-col gap-1 text-xs text-neutral-400">
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-white/10 bg-neutral-950/60 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-400/60";

function TextInput({ id, field, value, multiline }: { id: string; field: string; value: string; multiline?: boolean }) {
  const common = {
    value,
    onFocus: beginSession,
    onBlur: beginSession,
    className: inputCls,
  };
  return multiline ? (
    <textarea
      {...common}
      rows={3}
      onChange={(e) => livePatch(id, { [field]: e.target.value } as Partial<Node>)}
      className={`${inputCls} resize-y`}
    />
  ) : (
    <input {...common} type="text" onChange={(e) => livePatch(id, { [field]: e.target.value } as Partial<Node>)} />
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

function ColorField({ label, id, field, value }: { label: string; id: string; field: "color" | "background"; value: string | null }) {
  const patchStyle = useScreenStore((s) => s.patchStyle);
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-1.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => patchStyle(id, { [field]: c })}
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
            value={value ?? "#4f46e5"}
            onFocus={beginSession}
            onBlur={beginSession}
            onChange={(e) => liveStyle(id, { [field]: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => patchStyle(id, { [field]: null })}
            className="ml-auto text-[11px] text-neutral-500 hover:text-neutral-200"
          >
            Reset
          </button>
        )}
      </div>
    </Field>
  );
}

function WidthField({ node }: { node: Node }) {
  const patchNode = useScreenStore((s) => s.patchNode);
  const pct = node.widthPct ?? null;
  return (
    <Field label={`Width ${pct === null ? "(automatic)" : `${pct}%`}`}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={pct ?? 100}
          onPointerDown={beginSession}
          onFocus={beginSession}
          onChange={(e) => livePatch(node.id, { widthPct: Number(e.target.value) })}
          className="flex-1 accent-indigo-500"
        />
        <button
          type="button"
          disabled={pct === null}
          onClick={() => patchNode(node.id, { widthPct: null })}
          className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-neutral-400 hover:text-white disabled:opacity-40"
        >
          Auto
        </button>
      </div>
    </Field>
  );
}

// ---- panels ----

function ContentFields({ node }: { node: Node }) {
  const patchNode = useScreenStore((s) => s.patchNode);
  switch (node.type) {
    case "heading":
      return (
        <>
          <Field label="Text"><TextInput id={node.id} field="text" value={node.text} multiline /></Field>
          <Field label="Size">
            <Segmented
              value={node.level}
              options={[{ value: 1, label: "Large" }, { value: 2, label: "Medium" }, { value: 3, label: "Small" }]}
              onChange={(level) => patchNode(node.id, { level })}
            />
          </Field>
        </>
      );
    case "text":
      return (
        <>
          <Field label="Text"><TextInput id={node.id} field="text" value={node.text} multiline /></Field>
          <Field label="Tone">
            <Segmented
              value={node.tone}
              options={[{ value: "default", label: "Normal" }, { value: "muted", label: "Subtle" }]}
              onChange={(tone) => patchNode(node.id, { tone })}
            />
          </Field>
        </>
      );
    case "textbox":
      return (
        <>
          <Field label="Label"><TextInput id={node.id} field="label" value={node.label} /></Field>
          <Field label="Placeholder"><TextInput id={node.id} field="placeholder" value={node.placeholder} /></Field>
          <Field label="Size">
            <Segmented
              value={node.multiline ? "multi" : "single"}
              options={[{ value: "single", label: "One line" }, { value: "multi", label: "Paragraph" }]}
              onChange={(v) => patchNode(node.id, { multiline: v === "multi" })}
            />
          </Field>
        </>
      );
    case "button":
      return (
        <>
          <Field label="Label"><TextInput id={node.id} field="label" value={node.label} /></Field>
          <Field label="Style">
            <Segmented
              value={node.variant}
              options={[{ value: "primary", label: "Solid" }, { value: "secondary", label: "Outline" }, { value: "ghost", label: "Plain" }]}
              onChange={(variant) => patchNode(node.id, { variant })}
            />
          </Field>
        </>
      );
    case "image":
      return (
        <>
          <Field label="Description (changes the picture)"><TextInput id={node.id} field="alt" value={node.alt} /></Field>
          <Field label="Shape">
            <Segmented
              value={node.aspect}
              options={[{ value: "square", label: "Square" }, { value: "video", label: "Wide" }, { value: "wide", label: "Banner" }]}
              onChange={(aspect) => patchNode(node.id, { aspect })}
            />
          </Field>
        </>
      );
    case "checkbox":
      return <Field label="Label"><TextInput id={node.id} field="label" value={node.label} /></Field>;
    case "link":
      return <Field label="Text"><TextInput id={node.id} field="text" value={node.text} /></Field>;
    case "select":
      return (
        <>
          <Field label="Label"><TextInput id={node.id} field="label" value={node.label} /></Field>
          <Field label="Options (one per line)">
            <textarea
              rows={4}
              value={node.options.join("\n")}
              onFocus={beginSession}
              onBlur={beginSession}
              onChange={(e) => livePatch(node.id, { options: e.target.value.split("\n") })}
              className={`${inputCls} resize-y`}
            />
          </Field>
        </>
      );
    case "divider":
      return <p className="text-xs text-neutral-500">A horizontal line. Change its color below.</p>;
    case "container":
      return <LayoutFields node={node} />;
  }
}

function LayoutFields({ node }: { node: Container }) {
  const patchNode = useScreenStore((s) => s.patchNode);
  const set = (patch: Partial<Container>) => patchNode(node.id, patch);
  return (
    <>
      <Field label="Arrange children">
        <Segmented
          value={node.direction}
          options={[{ value: "row", label: "Side by side" }, { value: "column", label: "Stacked" }]}
          onChange={(direction) => set({ direction })}
        />
      </Field>
      <Field label="Spacing between">
        <Segmented
          value={node.gap}
          options={[{ value: "sm", label: "Tight" }, { value: "md", label: "Normal" }, { value: "lg", label: "Roomy" }]}
          onChange={(gap) => set({ gap })}
        />
      </Field>
      <Field label="Padding inside">
        <Segmented
          value={node.padding}
          options={[{ value: "none", label: "None" }, { value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }]}
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
          options={[
            { value: "start", label: "Start" },
            { value: "center", label: "Center" },
            { value: "end", label: "End" },
            { value: "between", label: "Spread" },
          ]}
          onChange={(justify) => set({ justify })}
        />
      </Field>
      <Field label="Background preset">
        <Segmented
          value={node.background}
          options={[
            { value: "none", label: "None" },
            { value: "surface", label: "Card" },
            { value: "muted", label: "Soft" },
            { value: "accent", label: "Accent" },
          ]}
          onChange={(background) => set({ background })}
        />
      </Field>
    </>
  );
}

function StyleFields({ node }: { node: Node }) {
  const patchStyle = useScreenStore((s) => s.patchStyle);
  const style = node.style ?? { color: null, background: null, radius: null };
  const hasText = !["image", "divider"].includes(node.type);
  const hasBg = node.type !== "divider";
  const hasRadius = ["container", "button", "image", "textbox", "select", "heading", "text"].includes(node.type);
  return (
    <>
      {hasText && <ColorField label="Text color" id={node.id} field="color" value={style.color} />}
      {node.type === "divider" && <ColorField label="Line color" id={node.id} field="color" value={style.color} />}
      {hasBg && <ColorField label="Background" id={node.id} field="background" value={style.background} />}
      {hasRadius && (
        <Field label="Corners">
          <Segmented
            value={style.radius ?? "default"}
            options={[
              { value: "default", label: "Auto" },
              { value: "none", label: "Sharp" },
              { value: "sm", label: "S" },
              { value: "md", label: "M" },
              { value: "lg", label: "L" },
              { value: "full", label: "Pill" },
            ]}
            onChange={(v) => patchStyle(node.id, { radius: v === "default" ? null : (v as Style["radius"]) })}
          />
        </Field>
      )}
      <WidthField node={node} />
    </>
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

  const action = "flex flex-1 items-center justify-center gap-1 rounded-md border border-white/10 py-1.5 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-30";

  return (
    <>
      <div className="px-4 pb-2 pt-3">
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-neutral-500">
          <button type="button" className="hover:text-neutral-200" onClick={() => s.select(null)}>Page</button>
          {path.map((n) => (
            <span key={n.id} className="flex items-center gap-1">
              <span>/</span>
              <button
                type="button"
                onClick={() => s.select(n.id)}
                className={n.id === node.id ? "font-medium text-indigo-300" : "hover:text-neutral-200"}
              >
                {TYPE_LABELS[n.type]}
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <button type="button" title="Move up" className={action} disabled={index <= 0} onClick={() => s.move(node.id, parentId, index - 1)}>
            <ArrowUpIcon />
          </button>
          <button
            type="button"
            title="Move down"
            className={action}
            disabled={index >= siblings.length - 1}
            onClick={() => s.move(node.id, parentId, index + 2)}
          >
            <ArrowDownIcon />
          </button>
          <button type="button" title="Select the group around this" className={action} disabled={!parentId} onClick={() => parentId && s.select(parentId)}>
            <ParentIcon />
          </button>
          <button type="button" title="Duplicate (⌘D)" className={action} onClick={() => s.duplicate(node.id)}>
            <CopyIcon />
          </button>
          <button type="button" title="Delete" className={`${action} hover:border-rose-500/40 hover:text-rose-300`} onClick={() => s.remove(node.id)}>
            <TrashIcon />
          </button>
        </div>
      </div>
      <Section title={node.type === "container" ? "Layout" : "Content"}>
        <ContentFields node={node} />
      </Section>
      <Section title="Look">
        <StyleFields node={node} />
      </Section>
    </>
  );
}

function PagePanel({ screen }: { screen: Screen }) {
  const setScreen = useScreenStore((s) => s.setScreen);
  return (
    <>
      <Section title="Page">
        <Field label="Title">
          <input
            type="text"
            value={screen.title}
            onFocus={beginSession}
            onBlur={beginSession}
            onChange={(e) => liveApply((sc) => ({ ...sc, title: e.target.value }))}
            className={inputCls}
          />
        </Field>
        <Field label="Theme">
          <Segmented
            value={screen.theme}
            options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
            onChange={(theme) => setScreen({ ...screen, theme })}
          />
        </Field>
      </Section>
      <Section title="How to edit">
        <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-neutral-400">
          <li><b className="text-neutral-200">Click</b> anything to select it and change it here.</li>
          <li><b className="text-neutral-200">Double-click</b> text to type over it.</li>
          <li><b className="text-neutral-200">Drag</b> an element to move it. Blue lines show where it lands.</li>
          <li><b className="text-neutral-200">Pull the blue handle</b> on the right edge to resize.</li>
          <li><b className="text-neutral-200">Select something, then ask the AI</b> for changes like “make this pop”.</li>
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
      className="flex w-full shrink-0 flex-col overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900/70 backdrop-blur md:max-h-[calc(100vh-14rem)] md:w-72"
      onClick={(e) => e.stopPropagation()}
    >
      {node ? <NodePanel node={node} screen={screen} /> : <PagePanel screen={screen} />}
    </aside>
  );
}
