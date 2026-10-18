import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { fade, useReducedMotionSafe } from "../../ui/motion";
import { ICON, STROKE, button, surface, text } from "../../ui/styles";
import { isUsableBox, normalizeRect, type Rect } from "./lift";

/** Full-screen overlay over a frozen frame: drag a rectangle around the table, chart or list to lift. */
export function LiftOverlay({ frameUrl, onSelect, onCancel }: { frameUrl: string; onSelect: (shown: Rect, size: { w: number; h: number }) => void; onCancel: () => void }) {
  const { v } = useReducedMotionSafe();
  const imgRef = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<Rect | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const local = (e: RPointerEvent) => {
    const r = imgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Lift from screen"
      data-testid="lift-overlay"
      variants={v(fade)}
      initial="hidden"
      animate="show"
      exit="exit"
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-6"
    >
      <div className={`${surface.pill} absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-2 py-1 pr-1 pl-4`}>
        <span className={text.ui}>Drag a box around the table, chart or list</span>
        <button type="button" aria-label="Cancel" title="Cancel (Esc)" onClick={onCancel} className={button.icon}>
          <X size={ICON.lg} strokeWidth={STROKE} aria-hidden />
        </button>
      </div>
      <div className="relative max-h-full max-w-full cursor-crosshair touch-none select-none">
        <img
          ref={imgRef}
          src={frameUrl}
          alt="Your screen, frozen"
          draggable={false}
          className="block max-h-[calc(100vh-96px)] max-w-[calc(100vw-48px)] rounded-lg"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = local(e);
            start.current = { x: p.x, y: p.y };
            setBox({ x: p.x, y: p.y, w: 0, h: 0 });
          }}
          onPointerMove={(e) => {
            if (!start.current) return;
            const p = local(e);
            setBox(normalizeRect(start.current, p, p.w, p.h));
          }}
          onPointerUp={(e) => {
            if (!start.current) return;
            const p = local(e);
            const r = normalizeRect(start.current, p, p.w, p.h);
            start.current = null;
            if (isUsableBox(r)) onSelect(r, { w: p.w, h: p.h });
            else setBox(null);
          }}
        />
        {box && box.w > 0 ? (
          <span
            aria-hidden="true"
            data-testid="lift-box"
            className="pointer-events-none absolute rounded-md border-2 border-accent bg-accent/10"
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          />
        ) : null}
      </div>
    </motion.div>,
    document.body,
  );
}
