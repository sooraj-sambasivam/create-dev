import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type Over,
} from "@dnd-kit/core";
import { findNode, isDescendant, updateNode, type Container, type Node, type Screen, type Style } from "@create/shared";
import { useScreenStore } from "../store/screenStore";
import {
  EditorContext,
  INLINE_FIELD,
  ROOT_ID,
  TYPE_LABELS,
  useEditor,
  type DropData,
  type DropTarget,
  type EditorState,
} from "../editor/EditorContext";
import { EditableText } from "../editor/EditableText";
import { CopyIcon, GripIcon, TrashIcon } from "../editor/icons";

type Direction = Container["direction"];

const gapClass: Record<Container["gap"], string> = { sm: "gap-2", md: "gap-4", lg: "gap-8" };
const padClass: Record<Container["padding"], string> = { none: "p-0", sm: "p-3", md: "p-6", lg: "p-10" };
const alignClass: Record<Container["align"], string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};
const justifyClass: Record<Container["justify"], string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};
const containerWidth: Record<Container["width"], string> = {
  full: "w-full",
  auto: "w-auto shrink-0",
  half: "w-full md:w-auto md:flex-1 md:basis-[45%] min-w-0",
  third: "w-full md:w-auto md:flex-1 md:basis-[28%] min-w-0",
};

const RADIUS: Record<NonNullable<Style["radius"]>, string> = {
  none: "0px",
  sm: "4px",
  md: "8px",
  lg: "16px",
  full: "9999px",
};

/** User style overrides as CSS. Only non-null fields produce output. */
function overrides(style: Style | null | undefined): CSSProperties {
  const css: CSSProperties = {};
  if (!style) return css;
  if (style.color) css.color = style.color;
  if (style.background) css.background = style.background;
  if (style.radius) css.borderRadius = RADIUS[style.radius];
  return css;
}

function containerStyle(bg: Container["background"], style: Style | null | undefined): CSSProperties {
  const css: CSSProperties & Record<string, string> = {};
  if (bg === "accent") {
    css.background = "var(--accent)";
    css.color = "var(--accent-fg)";
  } else if (bg !== "none") {
    css.background = `var(--${bg})`;
  }
  // Muted text and outlines inherit from the container's text color when it is not the page default,
  // so subtitles stay readable on accent or custom-colored sections.
  if (bg === "accent" || style?.color) {
    css["--fg-muted"] = "color-mix(in srgb, currentColor 72%, transparent)";
  }
  return css;
}

/** Width of a leaf depends on the parent's flow direction. */
function leafWidth(node: Node, parent: Direction, align: Container["align"]): string {
  if (parent === "column") {
    // Small controls hug their content so selection and resize handles sit on the element itself.
    if (align !== "stretch" && (node.type === "button" || node.type === "link" || node.type === "checkbox")) {
      return "w-fit max-w-full";
    }
    return "w-full";
  }
  switch (node.type) {
    case "textbox":
    case "image":
      return "flex-1 min-w-0";
    case "heading":
    case "text":
      return "min-w-0";
    default:
      return "shrink-0";
  }
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/40";
const inputBase: CSSProperties = { borderColor: "var(--border)", background: "var(--input-bg)", color: "var(--fg)" };

function Label({ nodeId, text, children }: { nodeId: string; text: string; children: ReactNode }) {
  if (!text) return <>{children}</>;
  return (
    <label className="flex w-full flex-col gap-1.5 text-sm font-medium">
      <EditableText nodeId={nodeId} field="label" value={text} />
      {children}
    </label>
  );
}

function ImageNode({ id, alt, aspect, style }: { id: string; alt: string; aspect: "video" | "square" | "wide"; style: CSSProperties }) {
  const [failedSeed, setFailedSeed] = useState<string | null>(null);
  const seed = `${id}-${alt}`;
  const aspectClass = aspect === "square" ? "aspect-square" : aspect === "wide" ? "aspect-[21/9]" : "aspect-video";
  return (
    <figure
      className={`relative w-full overflow-hidden rounded-xl ${aspectClass}`}
      style={{ background: "var(--muted)", ...style }}
    >
      {failedSeed !== seed ? (
        <img
          src={`https://picsum.photos/seed/${encodeURIComponent(seed)}/960/600`}
          alt={alt}
          loading="lazy"
          draggable={false}
          onError={() => setFailedSeed(seed)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center p-4 text-center text-sm"
          style={{ background: "linear-gradient(135deg, var(--muted), var(--surface))", color: "var(--fg-muted)" }}
        >
          {alt}
        </div>
      )}
    </figure>
  );
}

function Leaf({ node, fill }: { node: Exclude<Node, Container>; fill: boolean }) {
  const o = overrides(node.style);
  const boxed = o.background ? "px-2 py-1 rounded-md" : "";
  switch (node.type) {
    case "heading": {
      const cls =
        node.level === 1
          ? "text-4xl font-bold tracking-tight md:text-5xl"
          : node.level === 2
            ? "text-2xl font-semibold tracking-tight"
            : "text-lg font-semibold";
      const Tag = `h${node.level}` as const;
      return (
        <Tag className={`${cls} ${boxed}`} style={o}>
          <EditableText nodeId={node.id} field="text" value={node.text} />
        </Tag>
      );
    }
    case "text":
      return (
        <p
          className={`text-base leading-relaxed ${boxed}`}
          style={{ ...(node.tone === "muted" ? { color: "var(--fg-muted)" } : {}), ...o }}
        >
          <EditableText nodeId={node.id} field="text" value={node.text} />
        </p>
      );
    case "textbox":
      return (
        <Label nodeId={node.id} text={node.label}>
          {node.multiline ? (
            <textarea rows={4} placeholder={node.placeholder} className={inputClass} style={{ ...inputBase, ...o }} />
          ) : (
            <input type="text" placeholder={node.placeholder} className={inputClass} style={{ ...inputBase, ...o }} />
          )}
        </Label>
      );
    case "button": {
      const base = `rounded-lg px-4 py-2 text-sm font-medium transition active:scale-[0.98] ${fill ? "w-full" : ""}`;
      const variant: CSSProperties =
        node.variant === "primary"
          ? { background: "var(--accent)", color: "var(--accent-fg)" }
          : node.variant === "secondary"
            ? { border: "1px solid var(--border)", background: "var(--surface)", color: "var(--fg)" }
            : { color: "var(--accent)" };
      return (
        <button type="button" className={base} style={{ ...variant, ...o }}>
          <EditableText nodeId={node.id} field="label" value={node.label} />
        </button>
      );
    }
    case "image":
      return <ImageNode id={node.id} alt={node.alt} aspect={node.aspect} style={o} />;
    case "checkbox":
      return (
        <label className={`flex items-center gap-2 text-sm ${boxed}`} style={o}>
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" />
          <EditableText nodeId={node.id} field="label" value={node.label} />
        </label>
      );
    case "select":
      return (
        <Label nodeId={node.id} text={node.label}>
          <select className={inputClass} style={{ ...inputBase, ...o }} defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {[...new Set(node.options.map((o) => o.trim()).filter(Boolean))].map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Label>
      );
    case "link":
      return (
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className={`text-sm font-medium underline-offset-4 hover:underline ${fill ? "block" : ""} ${boxed}`}
          style={{ color: "var(--accent)", ...o }}
        >
          <EditableText nodeId={node.id} field="text" value={node.text} />
        </a>
      );
    case "divider":
      return (
        <hr
          className="w-full border-0 border-t"
          style={{ borderColor: node.style?.color ?? "var(--border)", ...(node.style?.background ? { borderColor: node.style.background } : {}) }}
        />
      );
  }
}

// ---------------------------------------------------------------- editor chrome

function SelectionToolbar({ node }: { node: Node }) {
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <div
      className="absolute -top-7 left-0 z-30 flex items-center gap-0.5 rounded-md bg-indigo-500 px-1 py-0.5 text-[11px] font-medium text-white shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="flex cursor-grab items-center gap-1 px-1" title="Drag to move">
        <GripIcon width={12} height={12} />
        {TYPE_LABELS[node.type]}
      </span>
      <button
        type="button"
        title="Duplicate (⌘D)"
        onPointerDown={stop}
        onClick={() => useScreenStore.getState().duplicate(node.id)}
        className="rounded p-1 hover:bg-white/20"
      >
        <CopyIcon width={12} height={12} />
      </button>
      <button
        type="button"
        title="Delete (Backspace)"
        onPointerDown={stop}
        onClick={() => useScreenStore.getState().remove(node.id)}
        className="rounded p-1 hover:bg-white/20"
      >
        <TrashIcon width={12} height={12} />
      </button>
    </div>
  );
}

function ResizeHandle({ nodeId, targetRef }: { nodeId: string; targetRef: React.RefObject<HTMLElement | null> }) {
  const { setResizing } = useEditor();

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const el = targetRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const cs = getComputedStyle(parent);
    const inner = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const startW = el.getBoundingClientRect().width;
    const startX = e.clientX;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    useScreenStore.getState().snapshot();
    setResizing({ id: nodeId, pct: Math.round((startW / inner) * 100) });

    const move = (ev: PointerEvent) => {
      const raw = ((startW + ev.clientX - startX) / inner) * 100;
      const pct = Math.max(10, Math.min(100, Math.round(raw / 5) * 5));
      const s = useScreenStore.getState();
      if (s.screen) s.replaceLive(updateNode(s.screen, nodeId, { widthPct: pct }));
      setResizing({ id: nodeId, pct });
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      setResizing(null);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  return (
    <div
      role="separator"
      aria-label="Drag to resize width; double-click to reset"
      title="Drag to resize · double-click for automatic width"
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        useScreenStore.getState().patchNode(nodeId, { widthPct: null });
      }}
      className="absolute -right-[7px] top-1/2 z-30 h-8 w-2.5 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white bg-indigo-500 shadow"
    />
  );
}

function DropIndicator({ position, axis }: { position: "before" | "after" | "inside"; axis: "x" | "y" }) {
  if (position === "inside") {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-400/10" />
    );
  }
  const cls =
    axis === "y"
      ? `left-0 right-0 h-[3px] ${position === "before" ? "-top-[5px]" : "-bottom-[5px]"}`
      : `top-0 bottom-0 w-[3px] ${position === "before" ? "-left-[5px]" : "-right-[5px]"}`;
  return <div className={`pointer-events-none absolute z-20 rounded-full bg-indigo-500 ${cls}`} />;
}

// ---------------------------------------------------------------- node view

interface Counter {
  i: number;
}

interface NodeViewProps {
  node: Node;
  parentId: string | null;
  index: number;
  parentDirection: Direction;
  parentAlign: Container["align"];
  counter: Counter;
}

const textAlignFor: Record<Container["align"], string> = {
  start: "",
  stretch: "",
  center: "text-center",
  end: "text-right",
};

function NodeView({ node, parentId, index, parentDirection, parentAlign, counter }: NodeViewProps) {
  const ed = useEditor();
  const selected = useScreenStore((s) => ed.editable && s.selectedId === node.id);
  const editingThis = useScreenStore((s) => s.editingId === node.id);
  const ref = useRef<HTMLElement | null>(null);

  const isContainer = node.type === "container";
  const drag = useDraggable({ id: node.id, disabled: !ed.editable || editingThis, data: { type: node.type } });
  const dropData: DropData = {
    nodeId: node.id,
    parentId,
    index,
    parentDirection,
    isContainer,
    isRoot: false,
    childCount: isContainer ? node.children.length : 0,
  };
  const drop = useDroppable({ id: `drop:${node.id}`, disabled: !ed.editable, data: dropData });
  const setRef = (el: HTMLElement | null) => {
    ref.current = el;
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };

  const delay = Math.min(counter.i++ * 0.035, 0.7);
  const pct = node.widthPct ?? null;
  const widthCls = pct !== null ? "min-w-0" : isContainer ? containerWidth[node.width] : leafWidth(node, parentDirection, parentAlign);
  const widthStyle: CSSProperties = pct !== null ? { width: `${pct}%`, maxWidth: "100%", flex: "0 0 auto" } : {};

  const hovered = ed.editable && ed.hoveredId === node.id && !selected;
  const editCls = !ed.editable
    ? ""
    : selected
      ? "outline-2 outline-indigo-500 outline-offset-2"
      : hovered
        ? "outline-1 outline-dashed outline-indigo-400/80 outline-offset-2"
        : "";
  const dragging = ed.draggingId === node.id;
  const indicator = ed.dropTarget?.indicator.nodeId === node.id ? ed.dropTarget.indicator : null;
  const resizingThis = ed.resizing?.id === node.id;

  const interactive = ed.editable
    ? {
        ...drag.attributes,
        ...drag.listeners,
        tabIndex: -1,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          useScreenStore.getState().select(node.id);
        },
        onDoubleClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          if (INLINE_FIELD[node.type] && (node.type !== "textbox" && node.type !== "select" ? true : Boolean(node.label))) {
            useScreenStore.getState().setEditing(node.id);
          }
        },
        onPointerOver: (e: React.PointerEvent) => {
          e.stopPropagation();
          if (ed.hoveredId !== node.id) ed.setHovered(node.id);
        },
      }
    : {};

  const chrome = ed.editable ? (
    <>
      {indicator && <DropIndicator position={indicator.position} axis={indicator.axis} />}
      {selected && !ed.draggingId && <SelectionToolbar node={node} />}
      {selected && !ed.draggingId && node.type !== "divider" && <ResizeHandle nodeId={node.id} targetRef={ref} />}
      {resizingThis && (
        <div className="absolute -bottom-7 right-0 z-30 rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] font-medium text-white">
          {ed.resizing!.pct}%
        </div>
      )}
    </>
  ) : null;

  const motionProps = {
    layout: !ed.resizing && !ed.draggingId,
    initial: { opacity: 0, y: 8 },
    animate: { opacity: dragging ? 0.35 : 1, y: 0 },
    transition: { duration: 0.3, delay, ease: "easeOut" as const, layout: { duration: 0.2 } },
  };

  if (node.type === "container") {
    const flow = node.direction === "row" ? "flex-row flex-wrap md:flex-nowrap" : "flex-col";
    const empty = node.children.length === 0;
    return (
      <motion.div
        ref={setRef}
        {...motionProps}
        {...interactive}
        className={`relative flex rounded-xl ${flow} ${gapClass[node.gap]} ${alignClass[node.align]} ${justifyClass[node.justify]} ${padClass[node.padding]} ${widthCls} ${editCls} ${empty && ed.editable ? "min-h-16" : ""}`}
        style={{ ...containerStyle(node.background, node.style), ...overrides(node.style), ...widthStyle }}
      >
        {empty && ed.editable && (
          <span className="pointer-events-none m-auto text-xs opacity-50">Empty group: drop elements here</span>
        )}
        {node.children.map((child, i) => (
          <NodeView
            key={child.id}
            node={child}
            parentId={node.id}
            index={i}
            parentDirection={node.direction}
            parentAlign={node.align}
            counter={counter}
          />
        ))}
        {chrome}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={setRef}
      {...motionProps}
      {...interactive}
      className={`relative ${widthCls} ${parentDirection === "column" ? textAlignFor[parentAlign] : ""} ${editCls}`}
      style={widthStyle}
    >
      <div className={ed.editable && !editingThis ? "pointer-events-none select-none" : ""}>
        <Leaf node={node} fill={pct !== null} />
      </div>
      {chrome}
    </motion.div>
  );
}

// ---------------------------------------------------------------- root + dnd

function RootView({ screen, counter }: { screen: Screen; counter: Counter }) {
  const ed = useEditor();
  const rootData: DropData = {
    nodeId: ROOT_ID,
    parentId: null,
    index: 0,
    parentDirection: "column",
    isContainer: true,
    isRoot: true,
    childCount: screen.children.length,
  };
  const drop = useDroppable({ id: `drop:${ROOT_ID}`, disabled: !ed.editable, data: rootData });
  const rootIndicator = ed.dropTarget?.indicator.nodeId === ROOT_ID;

  return (
    <div
      ref={drop.setNodeRef}
      className={`screen-${screen.theme} relative flex flex-1 flex-col gap-4 p-4 md:p-6 ${ed.editable ? "pt-10 md:pt-10" : ""}`}
      style={{ background: "var(--bg)", color: "var(--fg)" }}
      onClick={() => ed.editable && useScreenStore.getState().select(null)}
      onPointerLeave={() => ed.setHovered(null)}
      onPointerOver={() => ed.editable && ed.setHovered(null)}
    >
      {screen.children.map((node, i) => (
        <NodeView key={node.id} node={node} parentId={null} index={i} parentDirection="column" parentAlign="stretch" counter={counter} />
      ))}
      {rootIndicator && (
        <div className="pointer-events-none absolute inset-2 rounded-xl border-2 border-dashed border-indigo-400/70" />
      )}
    </div>
  );
}

function computeTarget(over: Over, pointer: { x: number; y: number }): DropTarget | null {
  const d = over.data.current as DropData | undefined;
  if (!d) return null;
  if (d.isRoot) {
    return { parentId: null, index: d.childCount, indicator: { nodeId: ROOT_ID, position: "inside", axis: "y" } };
  }
  const r = over.rect;
  const axis = d.parentDirection === "row" ? "x" : "y";
  const start = axis === "x" ? r.left : r.top;
  const size = axis === "x" ? r.width : r.height;
  const rel = (axis === "x" ? pointer.x : pointer.y) - start;

  let position: "before" | "after" | "inside";
  if (d.isContainer) {
    const edge = Math.min(16, size * 0.2);
    position = rel < edge ? "before" : rel > size - edge ? "after" : "inside";
  } else {
    position = rel < size / 2 ? "before" : "after";
  }

  if (position === "inside") {
    return { parentId: d.nodeId, index: d.childCount, indicator: { nodeId: d.nodeId, position, axis } };
  }
  return {
    parentId: d.parentId,
    index: position === "before" ? d.index : d.index + 1,
    indicator: { nodeId: d.nodeId, position, axis },
  };
}

export function ScreenRenderer({ screen, editable = false }: { screen: Screen; editable?: boolean }) {
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{ id: string; pct: number } | null>(null);
  const [hoveredId, setHovered] = useState<string | null>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const dropRef = useRef<DropTarget | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Pick the smallest droppable under the pointer, skipping the dragged node and its children.
  const collision = useCallback<CollisionDetection>((args) => {
    const activeId = String(args.active.id);
    const hits = pointerWithin(args).filter((c) => {
      const d = args.droppableContainers.find((x) => x.id === c.id)?.data.current as DropData | undefined;
      if (!d) return false;
      if (d.isRoot) return true;
      return d.nodeId !== activeId && !isDescendant(screenRef.current, activeId, d.nodeId);
    });
    const area = (id: string | number) => {
      const r = args.droppableRects.get(id);
      return r ? r.width * r.height : Number.POSITIVE_INFINITY;
    };
    return hits.sort((a, b) => area(a.id) - area(b.id));
  }, []);

  const updateTarget = (e: DragMoveEvent) => {
    const start = e.activatorEvent as PointerEvent;
    const pointer = { x: start.clientX + e.delta.x, y: start.clientY + e.delta.y };
    const next = e.over ? computeTarget(e.over, pointer) : null;
    const prev = dropRef.current;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      dropRef.current = next;
      setDropTarget(next);
    }
  };

  const clearDrag = () => {
    dropRef.current = null;
    setDropTarget(null);
    setDraggingId(null);
  };

  const ctx: EditorState = { editable, dropTarget, draggingId, resizing, setResizing, hoveredId, setHovered };
  const counter: Counter = { i: 0 };
  const draggedNode = draggingId ? findNode(screen, draggingId) : null;

  return (
    <EditorContext.Provider value={ctx}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={(e) => {
          const id = String(e.active.id);
          setDraggingId(id);
          const s = useScreenStore.getState();
          s.select(id);
          s.setEditing(null);
        }}
        onDragMove={updateTarget}
        onDragOver={updateTarget}
        onDragEnd={(e) => {
          const target = dropRef.current;
          const id = String(e.active.id);
          if (target) {
            const s = useScreenStore.getState();
            s.move(id, target.parentId, target.index);
            s.select(id);
          }
          clearDrag();
        }}
        onDragCancel={clearDrag}
      >
        <RootView screen={screen} counter={counter} />
        <DragOverlay dropAnimation={null}>
          {draggedNode && (
            <div className="pointer-events-none inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-2xl">
              <GripIcon width={12} height={12} />
              Moving {TYPE_LABELS[draggedNode.type].toLowerCase()}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </EditorContext.Provider>
  );
}
