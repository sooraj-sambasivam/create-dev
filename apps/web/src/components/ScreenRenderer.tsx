import { useCallback, useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import { duration, ease, spring, STAGGER, useReducedMotionSafe } from "../ui/motion";
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
import { TEXT_FIELD, findNode, isDescendant, updateNode, type Container, type Node, type Screen } from "@create/shared";
import { useScreenStore } from "../store/screenStore";
import {
  EditorContext,
  ROOT_ID,
  TYPE_LABELS,
  useEditor,
  type DropData,
  type DropTarget,
  type EditorState,
} from "../editor/EditorContext";
import {
  FONT_FAMILY,
  Leaf,
  accentVars,
  alignClass,
  containerStyle,
  containerWidth,
  gapClass,
  justifyClass,
  leafWidth,
  overrides,
  padClass,
  type Direction,
} from "./elements";
import { CopyIcon, GripIcon, TrashIcon } from "../editor/icons";
import { NodeAIBox } from "../editor/NodeAIBox";
import { ErrorBoundary } from "../ErrorBoundary";
import { clearFormFields, formOf, readFormFields, resolveAppId, submitForm } from "./forms";

// ---------------------------------------------------------------- editor chrome

function SelectionToolbar({ node }: { node: Node }) {
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <div
      className="absolute -top-7 left-0 z-30 flex items-center gap-0.5 rounded-md border border-line bg-surface px-1 py-0.5 text-xs font-medium text-ink-2 shadow-soft"
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
        className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink"
      >
        <CopyIcon width={12} height={12} />
      </button>
      <button
        type="button"
        title="Delete (Backspace)"
        onPointerDown={stop}
        onClick={() => useScreenStore.getState().remove(node.id)}
        className="rounded p-1 text-ink-2 hover:bg-hover hover:text-ink"
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
      className="absolute -right-[7px] top-1/2 z-30 h-6 w-1.5 -translate-y-1/2 cursor-ew-resize rounded-full border border-surface bg-accent"
    />
  );
}

function DropIndicator({ position, axis }: { position: "before" | "after" | "inside"; axis: "x" | "y" }) {
  if (position === "inside") {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 rounded-xl border border-dashed border-accent bg-accent/10" />
    );
  }
  const cls =
    axis === "y"
      ? `left-0 right-0 h-0.5 ${position === "before" ? "-top-[5px]" : "-bottom-[5px]"}`
      : `top-0 bottom-0 w-0.5 ${position === "before" ? "-left-[5px]" : "-right-[5px]"}`;
  return <div className={`pointer-events-none absolute z-20 rounded-full bg-accent ${cls}`} />;
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

function NodeViewInner({ node, parentId, index, parentDirection, parentAlign, counter }: NodeViewProps) {
  const ed = useEditor();
  const selected = useScreenStore((s) => ed.editable && s.selectedId === node.id);
  const editingThis = useScreenStore((s) => s.editingId === node.id);
  const aiBusy = useScreenStore((s) => s.aiBusyId === node.id);
  const ref = useRef<HTMLElement | null>(null);
  const [formNote, setFormNote] = useState<{ ok: boolean; text: string } | null>(null);

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

  const { reduce } = useReducedMotionSafe();
  const delay = reduce ? 0 : Math.min(counter.i++ * STAGGER, 0.5);
  const pct = node.widthPct ?? null;
  const widthCls = pct !== null ? "min-w-0" : isContainer ? containerWidth[node.width] : leafWidth(node, parentDirection, parentAlign);
  const widthStyle: CSSProperties = pct !== null ? { width: `${pct}%`, maxWidth: "100%", flex: "0 0 auto" } : {};

  const hovered = ed.editable && ed.hoveredId === node.id && !selected;
  const editCls = !ed.editable
    ? ""
    : selected
      ? "outline-1 outline-accent outline-offset-2"
      : hovered
        ? "outline-1 outline-line outline-offset-2"
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
          const field = TEXT_FIELD[node.type];
          if (field && (node as Record<string, unknown>)[field]) {
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
      {selected && !ed.draggingId && !ed.resizing && editingThis === false && <NodeAIBox node={node} targetRef={ref} />}
      {aiBusy && <div className="shimmer-light pointer-events-none absolute inset-0 z-20 rounded-xl" />}
      {resizingThis && (
        <div className="absolute -bottom-7 right-0 z-30 rounded border border-line bg-surface px-1.5 py-0.5 text-xs font-medium text-ink-2 shadow-soft">
          {ed.resizing!.pct}%
        </div>
      )}
    </>
  ) : null;

  const motionProps = {
    // "position" moves siblings aside without stretching their content (no scale distortion).
    layout: !ed.resizing && !ed.draggingId && !reduce ? ("position" as const) : false,
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
    animate: { opacity: dragging ? 0.35 : 1, y: 0 },
    transition: reduce
      ? { duration: duration.fast }
      : { duration: duration.slow, delay, ease: ease.emphasized, layout: spring.gentle },
  };

  if (node.type === "container") {
    // Wrapping rows of cards or photos become an even grid; wrapping rows of small things
    // (buttons, links, badges) just flow onto the next line.
    const cardLike = node.children.filter((c) => ["container", "image", "video", "map", "table"].includes(c.type)).length >= 3;
    const flow =
      node.direction === "row" && node.wrap
        ? cardLike
          ? "grid-wrap"
          : "flex flex-row flex-wrap"
        : node.direction === "row"
          ? "flex flex-row flex-wrap md:flex-nowrap"
          : "flex flex-col";
    const empty = node.children.length === 0;
    const form = formOf(node);
    // Forms are real in Preview and on shared pages: the form's own button posts to /api/forms/<appId>. Edit mode only selects.
    const onFormClick = (e: React.MouseEvent<HTMLElement>) => {
      if (!form || ed.editable) return;
      const btn = (e.target as HTMLElement).closest("button");
      if (!btn || btn.closest("[data-form]") !== e.currentTarget) return;
      const fields = readFormFields(form, e.currentTarget);
      const root = e.currentTarget;
      setFormNote(null);
      submitForm(resolveAppId(), { formId: form.id, fields }).then(
        () => {
          clearFormFields(form, root);
          setFormNote({ ok: true, text: "Thanks, we got it." });
        },
        () => setFormNote({ ok: false, text: "Couldn't send that. Try again." }),
      );
    };
    return (
      <motion.div
        ref={setRef}
        {...motionProps}
        {...interactive}
        {...(form && !ed.editable ? { onClick: onFormClick } : {})}
        className={`relative rounded-xl ${flow} ${gapClass[node.gap]} ${alignClass[node.align]} ${justifyClass[node.justify]} ${padClass[node.padding]} ${widthCls} ${editCls} ${empty && ed.editable ? "min-h-16" : ""}`}
        data-node-id={node.id}
        data-form={form ? "" : undefined}
        style={{ ...containerStyle(node), ...overrides(node.style), ...widthStyle }}
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
        {formNote && (
          <p role="status" className="text-sm" style={{ color: formNote.ok ? "var(--accent)" : "#dc2626" }}>
            {formNote.text}
          </p>
        )}
        {chrome}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={setRef}
      {...motionProps}
      {...interactive}
      data-node-id={node.id}
      className={`relative ${widthCls} ${parentDirection === "column" ? textAlignFor[parentAlign] : ""} ${editCls}`}
      style={widthStyle}
    >
      <div className={ed.editable && !editingThis ? "pointer-events-none select-none" : ""}>
        <Leaf node={node} fill={pct !== null} interactive={!ed.editable} />
      </div>
      {chrome}
    </motion.div>
  );
}

/** One bad node degrades to a placeholder; its siblings keep rendering. */
function NodeView(props: NodeViewProps) {
  return (
    <ErrorBoundary scope="node" resetKey={props.node} nodeId={props.node.id}>
      <NodeViewInner {...props} />
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------- root + dnd
/** Headings use the page font; body text uses it only where it stays easy to read. */
function fontVars(font: Screen["font"]): CSSProperties {
  const heading = FONT_FAMILY[font] ?? FONT_FAMILY.sans;
  const body = font === "serif" || font === "mono" || font === "rounded" ? heading : font === "handwritten" ? FONT_FAMILY.rounded : FONT_FAMILY.sans;
  return { "--font-heading": heading, fontFamily: body } as CSSProperties;
}

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
      data-screen-root
      className={`screen-${screen.theme} relative flex flex-1 flex-col gap-4 p-4 md:p-6 ${ed.editable ? "pt-10 pb-24 md:pt-10 md:pb-24" : ""}`}
      style={{ background: "var(--bg)", color: "var(--fg)", ...accentVars(screen.accent), ...fontVars(screen.font) }}
      onClick={() => ed.editable && useScreenStore.getState().select(null)}
      onPointerLeave={() => ed.setHovered(null)}
      onPointerOver={() => ed.editable && ed.setHovered(null)}
    >
      {screen.children.map((node, i) => (
        <NodeView key={node.id} node={node} parentId={null} index={i} parentDirection="column" parentAlign="stretch" counter={counter} />
      ))}
      {rootIndicator && (
        <div className="pointer-events-none absolute inset-2 rounded-xl border border-dashed border-accent/70" />
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

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
          // Ignore "drags" that barely moved: those were meant as clicks.
          const moved = Math.hypot(e.delta.x, e.delta.y);
          if (target && moved >= 16) {
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
            <div className="pointer-events-none inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink shadow-soft">
              <GripIcon width={12} height={12} />
              Moving {TYPE_LABELS[draggedNode.type].toLowerCase()}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </EditorContext.Provider>
  );
}
