import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { OUTPUT_DEFAULT_WIDTH, OUTPUT_MIN_WIDTH, maxOutputWidth, useOutputLayout } from "./outputLayout";

const STEP = 16;
const STEP_BIG = 64;

/**
 * Drag state. `x`/`w` anchor the drag to a pointer position and a pane width; `target` is the
 * width last requested from the store.
 */
export interface DragAnchor {
  x: number;
  w: number;
  target: number;
}

/**
 * Next width for a pointer move. `rendered` is the width the pane actually paints. The layout can
 * cap the pane below the stored width, so when the last request was larger than what is on screen,
 * the drag re-anchors on the rendered width. Otherwise the stored width drifts past the cap and the
 * handle lags the pointer when the drag reverses.
 */
export function dragWidth(anchor: DragAnchor, rendered: number, clientX: number): { anchor: DragAnchor; width: number } {
  let a = anchor;
  if (rendered < a.target) a = { x: clientX, w: rendered, target: rendered };
  const width = a.w + (a.x - clientX);
  return { anchor: { ...a, target: width }, width };
}

/** Width the pane is painted at, read from the DOM. The handle is a direct child of the pane. */
function renderedPaneWidth(handle: HTMLElement, fallback: number): number {
  const w = handle.parentElement?.offsetWidth;
  return w && w > 0 ? w : fallback;
}

/** Left-edge vertical separator of the Output pane. Dragging left widens it. */
export function ResizeHandle() {
  const width = useOutputLayout((s) => s.width);
  const setWidth = useOutputLayout((s) => s.setWidth);
  const reset = useOutputLayout((s) => s.reset);
  const setDragging = useOutputLayout((s) => s.setDragging);
  const drag = useRef<DragAnchor | null>(null);
  const [active, setActive] = useState(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const rendered = renderedPaneWidth(e.currentTarget, width);
    drag.current = { x: e.clientX, w: rendered, target: rendered };
    setActive(true);
    setDragging(true);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = dragWidth(drag.current, renderedPaneWidth(e.currentTarget, width), e.clientX);
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
    // The pane sits on the right, so ArrowLeft widens it and ArrowRight narrows it.
    if (e.key === "ArrowLeft") setWidth(width + step);
    else if (e.key === "ArrowRight") setWidth(width - step);
    else if (e.key === "Home") setWidth(OUTPUT_MIN_WIDTH);
    else if (e.key === "End") setWidth(maxOutputWidth());
    else if (e.key === "Enter") reset();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize output pane"
      aria-valuenow={width}
      aria-valuemin={OUTPUT_MIN_WIDTH}
      aria-valuemax={maxOutputWidth()}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
      data-default-width={OUTPUT_DEFAULT_WIDTH}
      className="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none outline-none"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors duration-150 group-hover:bg-accent group-focus-visible:bg-accent ${active ? "bg-accent" : "bg-transparent"}`}
      />
    </div>
  );
}
