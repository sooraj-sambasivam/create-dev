import { useEffect, useRef, useState } from "react";
import type { LassoHit, LassoRect, LassoResolver, LassoTarget } from "./targets";
import { surface } from "../../../ui/styles";
import type { Pt } from "../../../narrate/snippet";
import { DRAG_THRESHOLD_PX, LASSO_CURSOR, isLassoBlocked, markLassoDrag, peekLassoClick } from "./lassoGesture";

export type LassoEvent = {
  rect: LassoRect;
  targets: LassoTarget[];
  /** Visible box area by target id, for picking the smallest leaf. */
  areas: Record<string, number>;
  /** The loop as points (a rectangle's corners for Shift+drag). */
  poly: Pt[];
  /** "drag" = plain press-and-drag lasso; "shift" = the Shift+drag box that selects several for speech. */
  via: "drag" | "shift";
};

const rectPoly = (r: LassoRect): Pt[] => [
  { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
];
const bboxOf = (pts: readonly Pt[]): LassoRect => {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const p of pts) { l = Math.min(l, p.x); r = Math.max(r, p.x); t = Math.min(t, p.y); b = Math.max(b, p.y); }
  return pts.length ? { x: l, y: t, w: r - l, h: b - t } : { x: 0, y: 0, w: 0, h: 0 };
};

const norm = (a: { x: number; y: number }, bx: number, by: number): LassoRect => ({
  x: Math.min(a.x, bx), y: Math.min(a.y, by), w: Math.abs(bx - a.x), h: Math.abs(by - a.y),
});

/**
 * Lasso. A plain press-and-drag (no Shift) draws a free-hand loop and switches the cursor to a lasso; a short click
 * is left alone so it still pins. Shift+drag keeps drawing a box. Draws only in its own fixed layer; never mutates page DOM.
 */
export function Lasso({ resolve, onLasso, disabled }: { resolve: LassoResolver; onLasso: (ev: LassoEvent) => void; disabled?: boolean }) {
  const [shift, setShift] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rect, setRect] = useState<LassoRect | null>(null);
  const [hits, setHits] = useState<LassoHit[]>([]);
  const [loop, setLoop] = useState<Pt[]>([]);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fade = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef({ resolve, onLasso });
  cb.current = { resolve, onLasso };

  useEffect(() => {
    if (disabled) return;
    const kd = (e: KeyboardEvent) => e.key === "Shift" && setShift(true);
    const ku = (e: KeyboardEvent) => e.key === "Shift" && setShift(false);
    const blur = () => setShift(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    };
  }, [disabled]);

  useEffect(() => () => { if (fade.current) clearTimeout(fade.current); }, []);

  // Plain press-and-drag. Window-level and capture-phase so the page underneath keeps receiving normal clicks.
  useEffect(() => {
    if (disabled) return;
    let down: { x: number; y: number; id: number } | null = null;
    let pts: Pt[] = [];
    let active = false;
    let raf = 0;
    let styleEl: HTMLStyleElement | null = null;
    const begin = () => {
      active = true;
      if (fade.current) clearTimeout(fade.current);
      styleEl = document.createElement("style");
      styleEl.setAttribute("data-lasso-cursor", "");
      styleEl.textContent = `html, html * { cursor: ${LASSO_CURSOR} !important; user-select: none !important; -webkit-user-select: none !important; }`;
      document.head.appendChild(styleEl);
      window.getSelection()?.removeAllRanges();
      setRect(null);
      setHits([]);
    };
    const end = () => { active = false; down = null; pts = []; styleEl?.remove(); styleEl = null; if (raf) cancelAnimationFrame(raf); raf = 0; };
    const paint = () => {
      raf = 0;
      setLoop(pts.slice());
      setHits(cb.current.resolve(bboxOf(pts)));
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || !e.isPrimary) return;
      if (isLassoBlocked(e.target instanceof Element ? e.target : null)) return;
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
      pts = [{ x: e.clientX, y: e.clientY }];
    };
    const onMove = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      if (!active) {
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < DRAG_THRESHOLD_PX) return;
        begin();
      }
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const c of evs.length ? evs : [e]) {
        const last = pts[pts.length - 1]!;
        if ((c.clientX - last.x) ** 2 + (c.clientY - last.y) ** 2 >= 6) pts.push({ x: c.clientX, y: c.clientY });
      }
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      const was = active;
      const poly = pts.slice();
      end();
      if (!was) return; // a short click: the pin handler takes it
      markLassoDrag();
      const r = bboxOf(poly);
      if (poly.length < 4 || (r.w < 8 && r.h < 8)) { setLoop([]); setHits([]); return; }
      const h = cb.current.resolve(r);
      setLoop(poly);
      setHits(h);
      setRect(null);
      cb.current.onLasso({
        rect: r,
        poly,
        via: "drag",
        targets: h.map((x) => x.target),
        areas: Object.fromEntries(h.map((x) => [x.target.id, x.box.w * x.box.h])),
      });
      fade.current = setTimeout(() => { setLoop([]); setHits([]); }, 1400);
    };
    const onClick = (e: MouseEvent) => {
      // The click that ends a drag lands on whatever is under the pointer: swallow it.
      if (peekLassoClick()) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    const block = (e: Event) => { if (active || down) e.preventDefault(); };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, { capture: true, passive: false });
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("selectstart", block, true);
    window.addEventListener("dragstart", block, true);
    return () => {
      end();
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("selectstart", block, true);
      window.removeEventListener("dragstart", block, true);
    };
  }, [disabled]);

  const down = (e: React.PointerEvent) => {
    if (fade.current) clearTimeout(fade.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    setHits([]);
  };
  const move = (e: React.PointerEvent) => {
    if (!start.current) return;
    const r = norm(start.current, e.clientX, e.clientY);
    setRect(r);
    setHits(cb.current.resolve(r));
  };
  const up = (e: React.PointerEvent) => {
    if (!start.current) return;
    const r = norm(start.current, e.clientX, e.clientY);
    start.current = null;
    setDragging(false);
    if (r.w < 6 && r.h < 6) { setRect(null); setHits([]); return; }
    const h = cb.current.resolve(r);
    setRect(r);
    setHits(h);
    cb.current.onLasso({
      rect: r,
      poly: rectPoly(r),
      via: "shift",
      targets: h.map((x) => x.target),
      areas: Object.fromEntries(h.map((x) => [x.target.id, x.box.w * x.box.h])),
    });
    fade.current = setTimeout(() => { setRect(null); setHits([]); }, 1200);
  };

  if (disabled) return null;
  return (
    <div data-narrate-ignore aria-hidden="true" className="pointer-events-none fixed inset-0 z-[101]">
      {(shift || dragging) && (
        <div
          className="pointer-events-auto absolute inset-0 cursor-crosshair select-none"
          style={{ touchAction: "none" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      )}
      {hits.map(({ box }, i) => (
        <div
          key={i}
          className="absolute rounded-lg"
          style={{ left: box.x - 2, top: box.y - 2, width: box.w + 4, height: box.h + 4, boxShadow: "0 0 0 2px var(--color-accent)" }}
        />
      ))}
      {!dragging && (rect || loop.length > 2) && hits.length > 0 && (
        <div
          className={`absolute ${surface.pill} px-3 text-[12px] leading-6 text-ink`}
          style={{ left: (rect ?? bboxOf(loop)).x, top: Math.max(8, (rect ?? bboxOf(loop)).y - 32) }}
        >
          {hits.length} selected
        </div>
      )}
      {loop.length > 2 && (
        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
          <path
            d={`M${loop.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L")} Z`}
            fill="color-mix(in srgb, var(--color-accent) 9%, transparent)"
            stroke="var(--color-accent)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}
      {rect && (
        <div
          className="absolute rounded-lg"
          style={{
            left: rect.x, top: rect.y, width: rect.w, height: rect.h,
            border: "1.5px solid var(--color-accent)",
            background: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
          }}
        />
      )}
    </div>
  );
}
