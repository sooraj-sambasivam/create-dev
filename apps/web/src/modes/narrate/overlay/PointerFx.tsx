import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Look } from "../../../ui/look";
import { bracketPath, edgeAnchor, inkOutlinePath, isPrecise, outlineLength, pathLength, roundedRect, seedOf, spotlightPath, splitDeictic, threadPath, tickMarks, type Rect } from "./ink";
import { meterSteps, sizeLabel } from "./widen";
import { useTyped } from "./useTyped";

/**
 * Keyframes and helper classes for the drawn marks. One static string, injected once with the layer.
 * Animates transform, opacity, clip and stroke-dashoffset only. Reduced motion draws every mark finished.
 */
const FX_CSS = `
@keyframes pfx-draw { to { stroke-dashoffset: 0; } }
@keyframes pfx-lock { from { opacity: 0; transform: scale(1.05); } to { opacity: 1; transform: none; } }
@keyframes pfx-swipe { from { background-size: 0% 70%; } to { background-size: 100% 70%; } }
@keyframes pfx-ring { to { stroke-dashoffset: 0; } }
@keyframes pfx-pulse { 50% { opacity: .55; } }
.pfx-draw { stroke-dasharray: var(--len); stroke-dashoffset: var(--len); animation: pfx-draw 360ms cubic-bezier(.3,0,0,1) forwards; }
.pfx-thread { stroke-dasharray: var(--len); stroke-dashoffset: var(--len); animation: pfx-draw 520ms cubic-bezier(.3,0,0,1) 80ms forwards; }
.pfx-lock { transform-box: fill-box; transform-origin: center; animation: pfx-lock 200ms cubic-bezier(.3,0,0,1) both; }
.pfx-hl { background-image: linear-gradient(var(--color-highlight), var(--color-highlight)); background-repeat: no-repeat; background-position: 0 90%; background-size: 100% 70%; border-radius: 3px; padding: 0 3px; margin: 0 -3px; animation: pfx-swipe 600ms ease-out; }
.pfx-ring { stroke-dasharray: var(--len); stroke-dashoffset: var(--len); animation: pfx-ring 450ms linear forwards; }
.pfx-pulse { animation: pfx-pulse 1.4s ease-in-out infinite; }
.pfx-still .pfx-draw, .pfx-still .pfx-thread, .pfx-still .pfx-ring { animation: none; stroke-dashoffset: 0; }
.pfx-still .pfx-lock, .pfx-still .pfx-hl, .pfx-still .pfx-pulse { animation: none; }
@media (prefers-reduced-motion: reduce) {
  .pfx-draw, .pfx-thread, .pfx-ring { animation: none; stroke-dashoffset: 0; }
  .pfx-lock, .pfx-hl, .pfx-pulse { animation: none; }
}`;

export type FxRect = { left: number; top: number; width: number; height: number };

const toRect = (r: FxRect): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });

/** Five-step confidence: pen dots on Paper, glowing segments on Luminous. */
export function ConfidenceMeter({ look, value }: { look: Look; value: number }) {
  const on = meterSteps(value);
  return (
    <span
      role="img"
      aria-label={`Confidence ${on} of 5`}
      className="inline-flex shrink-0 items-center gap-[3px]"
      data-confidence={on}
    >
      {[0, 1, 2, 3, 4].map((i) =>
        look === "paper" ? (
          <span key={i} className={`size-[7px] rounded-full border border-pen ${i < on ? "bg-pen" : "bg-transparent"}`} />
        ) : (
          <span
            key={i}
            className={`h-[7px] w-[9px] rounded-[2px] ${i < on ? "bg-accent" : "bg-line"}`}
            style={i < on ? { boxShadow: "0 0 8px var(--color-glow)" } : undefined}
          />
        ),
      )}
    </span>
  );
}

export type PointerFxProps = {
  look: Look;
  /** The target's box in viewport px, or null with no target. */
  rect: FxRect | null;
  /** Stable id for the target, so the hand-drawn line keeps its shape. */
  seed: string;
  /** Pinned or acting: the spotlight is full strength. */
  strong: boolean;
  reduce: boolean | null;
  /** Show W x H measurement ticks (after a widen, or on a pinned target). */
  ticks: boolean;
  /** What the margin note writes: "12 rows, 4 columns". */
  note: string | null;
  /** The live spoken line; its "this" gets the highlighter and the thread. */
  caption: string | null;
  cursor: { x: number; y: number };
  /** 0..1 progress toward the next widen step, or null when not dwelling. */
  ring: { key: string; show: boolean } | null;
  viewport: { w: number; h: number };
};

/**
 * The drawn marks around the pointed-at thing, per look.
 * Paper: a self-drawing ink outline, a highlighter swipe on "this", a handwritten margin note, a pen line.
 * Luminous: corner brackets and a soft magenta outline, the room dimmed around the target, a glowing thread.
 */
export function PointerFx({ look, rect, seed, strong, reduce, ticks, note, caption, cursor, ring, viewport }: PointerFxProps) {
  const r = rect ? toRect({ left: rect.left - 3, top: rect.top - 3, width: rect.width + 6, height: rect.height + 6 }) : null;
  const paper = look === "paper";
  const typed = useTyped(note ?? "", reduce);
  const parts = caption ? splitDeictic(caption) : null;
  const thisRef = useRef<HTMLElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  // Measure the "this" word after the caption lays out, so the thread starts under it.
  useLayoutEffect(() => {
    const el = thisRef.current;
    if (!el || !parts) {
      setAnchor(null);
      return;
    }
    const b = el.getBoundingClientRect();
    const next = { x: Math.round(b.left + b.width / 2), y: Math.round(b.bottom) };
    setAnchor((p) => (p && p.x === next.x && p.y === next.y ? p : next));
  }, [caption, parts]);

  const outlineD = useMemo(() => (r && paper ? inkOutlinePath(r, seedOf(seed)) : ""), [r?.x, r?.y, r?.w, r?.h, paper, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const thread = useMemo(() => {
    if (!r || !anchor) return null;
    const to = edgeAnchor(r, anchor);
    return { d: threadPath(anchor, to), len: pathLength(anchor, to), to };
  }, [r?.x, r?.y, r?.w, r?.h, anchor]); // eslint-disable-line react-hooks/exhaustive-deps

  const tm = r && ticks ? tickMarks(r) : null;
  // The margin note goes in the right margin when it fits, else the left.
  const noteX = r ? (r.x + r.w + 12 + 200 < viewport.w ? r.x + r.w + 12 : Math.max(8, r.x - 212)) : 0;
  const dim = r ? (strong ? 1 : paper ? 0.7 : 0.45) : 0;

  return (
    <div className={`pointer-events-none absolute inset-0 ${reduce ? "pfx-still" : ""}`} data-look-fx={look}>
      <style>{FX_CSS}</style>

      <div aria-hidden="true" className="absolute inset-0">
        {/* The room dims around the target. Paper: a light ink wash. Luminous: a deep dim plus a soft glow. */}
        <svg width="100%" height="100%" className="absolute inset-0" style={{ opacity: dim, transition: "opacity 200ms" }}>
          <path d={spotlightPath(viewport, r)} fillRule="evenodd" style={{ fill: "var(--color-spotlight-dim)" }} />
        </svg>
        {!paper && r && (
          // A box-shadow paints only outside the box, so the lit thing itself is never tinted.
          <div
            className="absolute rounded-[12px]"
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, boxShadow: "0 0 40px 6px var(--color-glow), 0 0 90px 16px var(--color-glow)", opacity: strong ? 1 : 0.6 }}
          />
        )}

        <svg width="100%" height="100%" className="absolute inset-0 overflow-visible">
          {r && paper && (
            <g key={`ink-${seed}-${Math.round(r.w)}`}>
              <path
                d={outlineD}
                className="pfx-draw"
                fill="none"
                style={{ ["--len" as string]: outlineLength(r), stroke: "var(--color-accent)", strokeWidth: isPrecise(r) ? 1.5 : 2, strokeLinecap: "round", strokeLinejoin: "round" }}
              />
            </g>
          )}
          {r && !paper && (
            <g key={`lum-${seed}`} className="pfx-lock" style={{ filter: "drop-shadow(0 0 6px var(--color-glow))" }}>
              <path d={roundedRect(r, 10)} fill="none" style={{ stroke: "var(--color-accent)", strokeWidth: 1, opacity: 0.45 }} />
              <path d={bracketPath(r)} fill="none" style={{ stroke: "var(--color-accent)", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }} />
            </g>
          )}

          {r && tm && (
            <g style={{ stroke: "var(--color-pen)", strokeWidth: 1, opacity: 0.9 }}>
              {tm.top.map((x) => <path key={`t${x}`} d={`M${x} ${r.y - 6}V${r.y}`} />)}
              {tm.left.map((y) => <path key={`l${y}`} d={`M${r.x - 6} ${y}H${r.x}`} />)}
            </g>
          )}

          {thread && (
            <g key={`th-${seed}`}>
              <path
                d={thread.d}
                className="pfx-thread"
                fill="none"
                style={{
                  ["--len" as string]: thread.len,
                  stroke: paper ? "var(--color-pen)" : "var(--color-accent)",
                  strokeWidth: paper ? 1.75 : 1.6,
                  strokeLinecap: "round",
                  filter: paper ? undefined : "drop-shadow(0 0 5px var(--color-accent))",
                }}
              />
              <circle cx={thread.to.x} cy={thread.to.y} r={paper ? 3 : 4} style={{ fill: paper ? "var(--color-pen)" : "var(--color-accent)", filter: paper ? undefined : "drop-shadow(0 0 6px var(--color-accent))" }} />
            </g>
          )}

          {ring?.show && (
            <g key={ring.key} transform={`translate(${cursor.x} ${cursor.y})`}>
              <circle r={11} fill="none" style={{ stroke: "var(--color-line)", strokeWidth: 2 }} />
              <circle
                r={11}
                fill="none"
                className="pfx-ring"
                transform="rotate(-90)"
                style={{ ["--len" as string]: 70, stroke: paper ? "var(--color-pen)" : "var(--color-accent)", strokeWidth: 2, strokeLinecap: "round" }}
              />
            </g>
          )}
        </svg>
      </div>

      {r && ticks && (
        <span
          aria-hidden="true"
          className="absolute whitespace-nowrap rounded bg-surface/85 px-1 font-mono text-[12px] leading-4 tabular-nums text-pen"
          style={{ left: r.x + r.w, top: r.y - 20, transform: "translateX(-100%)" }}
        >
          {sizeLabel({ width: r.w - 6, height: r.h - 6 })}
        </span>
      )}

      {r && note && typed && (
        <span
          aria-hidden="true"
          className={paper ? "font-note absolute w-[200px] text-[18px] leading-6 text-pen" : "absolute w-[200px] rounded-md border border-line bg-surface/80 px-2 py-1 font-mono text-[13px] leading-5 text-pen"}
          style={{ left: noteX, top: r.y + 4, transform: paper ? "rotate(-1.5deg)" : undefined, boxShadow: paper ? undefined : "0 0 18px -6px var(--color-glow)" }}
        >
          {typed}
          {typed.length < (note?.length ?? 0) && <span className="ml-px inline-block h-[1em] w-px translate-y-[2px] bg-pen" />}
        </span>
      )}

      {caption && (
        <p
          aria-hidden="true"
          className="font-display absolute left-1/2 top-[72px] max-w-[min(640px,calc(100vw-48px))] -translate-x-1/2 truncate rounded-xl border border-line bg-surface/90 px-4 py-1.5 text-[22px] leading-8 text-ink shadow-soft"
        >
          {parts ? (
            <>
              {parts[0]}
              <mark ref={thisRef} className="pfx-hl bg-transparent text-ink">{parts[1]}</mark>
              {parts[2]}
            </>
          ) : (
            caption
          )}
        </p>
      )}
    </div>
  );
}
