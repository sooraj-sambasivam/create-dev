import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { RIGHT_PANEL_DEFAULT_WIDTH, RIGHT_PANEL_MIN_WIDTH, maxRightPanelWidth, useRightPanel } from "./rightPanelStore";

const STEP = 16;
const STEP_BIG = 64;

/** Drag anchor: pointer x and panel width at the start, plus the width last requested from the store. */
export interface DragAnchor {
  x: number;
  w: number;
  target: number;
}

/**
 * Next width for a pointer move. `rendered` is the width the panel actually paints. The layout can
 * cap the panel below the stored width; when the last request was larger than what is on screen the
 * drag re-anchors on the rendered width, so reversing the drag has no dead zone.
 */
export function dragWidth(anchor: DragAnchor, rendered: number, clientX: number): { anchor: DragAnchor; width: number } {
  let a = anchor;
  if (rendered < a.target) a = { x: clientX, w: rendered, target: rendered };
  const width = a.w + (a.x - clientX);
  return { anchor: { ...a, target: width }, width };
}

function renderedPanelWidth(handle: HTMLElement, fallback: number): number {
  const w = handle.parentElement?.offsetWidth;
  return w && w > 0 ? w : fallback;
}

/** Left-edge vertical separator of the right panel. Dragging left widens it. */
export function ResizeHandle() {
  const width = useRightPanel((s) => s.width);
  const setWidth = useRightPanel((s) => s.setWidth);
  const reset = useRightPanel((s) => s.reset);
  const setDragging = useRightPanel((s) => s.setDragging);
  const drag = useRef<DragAnchor | null>(null);
  const [active, setActive] = useState(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const rendered = renderedPanelWidth(e.currentTarget, width);
    drag.current = { x: e.clientX, w: rendered, target: rendered };
    setActive(true);
    setDragging(true);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = dragWidth(drag.current, renderedPanelWidth(e.currentTarget, width), e.clientX);
    drag.current = next.anchor;
    setWidth(next.width);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setActive(false);
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? STEP_BIG : STEP;
    // The panel sits on the right: ArrowLeft widens it, ArrowRight narrows it.
    if (e.key === "ArrowLeft") setWidth(width + step);
    else if (e.key === "ArrowRight") setWidth(width - step);
    else if (e.key === "Home") setWidth(RIGHT_PANEL_MIN_WIDTH);
    else if (e.key === "End") setWidth(maxRightPanelWidth());
    else if (e.key === "Enter") reset();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize side panel"
      aria-valuenow={width}
      aria-valuemin={RIGHT_PANEL_MIN_WIDTH}
      aria-valuemax={maxRightPanelWidth()}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
      data-default-width={RIGHT_PANEL_DEFAULT_WIDTH}
      className="group absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize touch-none outline-none"
    >
      <span
        aria-hidden
        className={`absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors duration-150 group-hover:bg-accent group-focus-visible:bg-accent ${active ? "bg-accent" : "bg-transparent"}`}
      />
    </div>
  );
}
