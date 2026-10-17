import { useEffect, useRef, useState } from "react";
import type { LassoHit, LassoRect, LassoResolver, LassoTarget } from "./targets";

export type LassoEvent = { rect: LassoRect; targets: LassoTarget[] };

const norm = (a: { x: number; y: number }, bx: number, by: number): LassoRect => ({
  x: Math.min(a.x, bx), y: Math.min(a.y, by), w: Math.abs(bx - a.x), h: Math.abs(by - a.y),
});

/** Shift+drag lasso. Draws only in its own fixed layer; never mutates page DOM. */
export function Lasso({ resolve, onLasso, disabled }: { resolve: LassoResolver; onLasso: (ev: LassoEvent) => void; disabled?: boolean }) {
  const [shift, setShift] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rect, setRect] = useState<LassoRect | null>(null);
  const [hits, setHits] = useState<LassoHit[]>([]);
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
    cb.current.onLasso({ rect: r, targets: h.map((x) => x.target) });
    fade.current = setTimeout(() => { setRect(null); setHits([]); }, 1200);
  };

  if (disabled) return null;
  return (
    <div data-narrate-ignore aria-hidden="true" className="pointer-events-none fixed inset-0 z-[101]">
      <style>{`@keyframes narrate-march{to{background-position:200% 0}}
@media (prefers-reduced-motion: reduce){.narrate-glow{animation:none!important}}`}</style>
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
          className="absolute rounded-md"
          style={{ left: box.x - 2, top: box.y - 2, width: box.w + 4, height: box.h + 4, boxShadow: "0 0 0 2px var(--accent, #3E7BF0), 0 0 14px 2px rgba(62,123,240,0.35)" }}
        />
      ))}
      {rect && (
        <div
          className="narrate-glow absolute rounded-xl"
          style={{
            left: rect.x, top: rect.y, width: rect.w, height: rect.h,
            border: "2px solid var(--accent, #3E7BF0)",
            boxShadow: "0 0 24px 4px rgba(62,123,240,0.35), inset 0 0 20px rgba(62,123,240,0.12)",
            background: "linear-gradient(90deg, rgba(62,123,240,0.06), rgba(62,123,240,0.18), rgba(62,123,240,0.06)) 0 0 / 200% 100%",
            animation: "narrate-march 1.6s linear infinite",
          }}
        />
      )}
    </div>
  );
}
