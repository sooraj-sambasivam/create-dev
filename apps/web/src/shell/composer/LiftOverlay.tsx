import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { fade, useReducedMotionSafe } from "../../ui/motion";
import { ICON, STROKE, button, surface, text } from "../../ui/styles";
import {
  buildScreenLocateRequest,
  decideLocate,
  frameForLocate,
  locate,
  normalizeRect,
  isUsableBox,
  reportClientStage,
  scaleRect,
  type LocateCandidate,
  type Rect,
} from "./lift";

type Phase =
  | { kind: "draw" }
  | { kind: "locating" }
  | { kind: "notice"; text: string }
  | { kind: "ask"; ask: string; candidates: LocateCandidate[]; shown: { w: number; h: number }; mine: Rect };

/** Full-screen overlay over a frozen frame: drag a rectangle around the table, chart or list to lift. */
export function LiftOverlay({ frameUrl, onSelect, onCancel }: { frameUrl: string; onSelect: (shown: Rect, size: { w: number; h: number }) => void; onCancel: () => void }) {
  const { v } = useReducedMotionSafe();
  const imgRef = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<Rect | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "draw" });
  // Cancel (Esc) or unmount while locating must not select afterwards.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // Shrink the frame once, while the user is still looking for their target.
  const prepared = useRef<ReturnType<typeof frameForLocate> | null>(null);
  useEffect(() => {
    prepared.current = frameForLocate(frameUrl);
    prepared.current.catch(() => {});
  }, [frameUrl]);

  /** Refine the dragged box through /api/locate. Every outcome is visible: a refined box, "Which one?", or a notice. */
  const refine = async (mine: Rect, shown: { w: number; h: number }) => {
    setPhase({ kind: "locating" });
    const t0 = performance.now();
    const finish = (ok: boolean, error?: string) => void reportClientStage({ stage: "locate", provider: "client:lift-locate", ms: performance.now() - t0, ok, error });
    try {
      const frame = await prepared.current!;
      const sent = scaleRect(mine, shown, frame.size);
      const res = await locate(buildScreenLocateRequest(frame.image, frame.size, sent));
      if (!alive.current) return;
      const d = decideLocate(res, sent);
      finish(d.kind !== "fallback", d.kind === "fallback" ? d.reason : undefined);
      if (d.kind === "use") {
        const b = scaleRect(d.box, frame.size, shown);
        onSelect(isUsableBox(b) ? b : mine, shown);
      } else if (d.kind === "ask") {
        setPhase({ kind: "ask", ask: d.ask, shown, mine, candidates: d.candidates.map((c) => ({ ...c, box: scaleRect(c.box, frame.size, shown) })) });
      } else {
        await notice(`${d.reason}. Using your box.`);
        if (alive.current) onSelect(mine, shown);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Locate failed";
      finish(false, msg);
      if (!alive.current) return;
      await notice(`${msg}. Using your box.`);
      if (alive.current) onSelect(mine, shown);
    }
  };
  const notice = async (text: string) => {
    if (alive.current) setPhase({ kind: "notice", text });
    await new Promise((r) => setTimeout(r, 1100));
  };

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
        <span className={text.ui} role="status" data-testid="lift-status">
          {phase.kind === "locating" ? "Finding it…" : phase.kind === "notice" ? phase.text : phase.kind === "ask" ? phase.ask : "Drag a box around the table, chart or list"}
        </span>
        {phase.kind === "ask" ? (
          <button type="button" className={button.secondary} onClick={() => onSelect(phase.mine, phase.shown)}>
            Use my box
          </button>
        ) : null}
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
            if (phase.kind !== "draw") return;
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
            if (isUsableBox(r)) void refine(r, { w: p.w, h: p.h });
            else setBox(null);
          }}
        />
        {phase.kind === "ask"
          ? phase.candidates.map((c, i) => (
              <button
                key={i}
                type="button"
                data-testid="lift-candidate"
                aria-label={`Use ${c.label || "this"}`}
                title={c.label}
                onClick={() => onSelect(c.box, phase.shown)}
                className="absolute rounded-md border-2 border-accent bg-accent/15 hover:bg-accent/30 focus-visible:outline-2"
                style={{ left: c.box.x, top: c.box.y, width: c.box.w, height: c.box.h }}
              >
                <span className="absolute -top-6 left-0 max-w-full truncate rounded-md bg-surface px-1.5 text-[12px] text-ink">{i + 1}. {c.label || "This one"}</span>
              </button>
            ))
          : null}
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
