import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { edgeAnchor, pathLength, roundedRect, splitDeictic, threadPath, tickMarks, type Rect } from "./ink";
import { meterSteps, sizeLabel } from "./widen";
import { useTyped } from "./useTyped";

/**
 * Keyframes and helper classes for the drawn marks. One static string, injected once with the layer.
 * Animates transform, opacity, clip and stroke-dashoffset only. Reduced motion draws every mark finished.
 */
const FX_CSS = `
@keyframes pfx-draw { to { stroke-dashoffset: 0; } }
@keyframes pfx-lock { from { opacity: 0; transform: scale(1.05); } to { opacity: 1; transform: none; } }
@keyframes pfx-ring { to { stroke-dashoffset: 0; } }
@keyframes pfx-pulse { 50% { opacity: .55; } }
.pfx-draw { stroke-dasharray: var(--len); stroke-dashoffset: var(--len); animation: pfx-draw 360ms cubic-bezier(.3,0,0,1) forwards; }
.pfx-thread { stroke-dasharray: var(--len); stroke-dashoffset: var(--len); animation: pfx-draw 520ms cubic-bezier(.3,0,0,1) 80ms forwards; }
.pfx-lock { transform-box: fill-box; transform-origin: center; animation: pfx-lock 200ms cubic-bezier(.3,0,0,1) both; }
.pfx-hl { color: var(--color-accent); font-weight: 600; }
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

/** Five-step confidence: filled dots in the accent. */
export function ConfidenceMeter({ value }: { value: number }) {
  const on = meterSteps(value);
  return (
    <span
      role="img"
      aria-label={`Confidence ${on} of 5`}
      className="inline-flex shrink-0 items-center gap-[3px]"
      data-confidence={on}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`size-[6px] rounded-full ${i < on ? "bg-accent" : "bg-line"}`} />
      ))}
    </span>
  );
}

export type PointerFxProps = {
  /** The target's box in viewport px, or null with no target. */
  rect: FxRect | null;
  /** Stable id for the target; a new id replays the outline entrance. */
  seed: string;
  /** Pinned or acting: the outline is full strength. */
  strong: boolean;
  reduce: boolean | null;
  /** Show W x H measurement ticks (after a widen, or on a pinned target). */
  ticks: boolean;
  /** What the note chip says: "12 rows, 4 columns". */
  note: string | null;
  /** The live spoken line; its "this" gets the highlighter and the thread. */
  caption: string | null;
  cursor: { x: number; y: number };
  /** 0..1 progress toward the next widen step, or null when not dwelling. */
  ring: { key: string; show: boolean } | null;
  viewport: { w: number; h: number };
};

/**
 * The marks around the pointed-at thing: a 2px accent outline, a thin line from "this" in the spoken
 * caption to the target, size ticks and a small note chip. No dimming, glow or hand-drawn strokes.
 */
export function PointerFx({ rect, seed, strong, reduce, ticks, note, caption, cursor, ring, viewport }: PointerFxProps) {
  const r = rect ? toRect({ left: rect.left - 3, top: rect.top - 3, width: rect.width + 6, height: rect.height + 6 }) : null;
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

  const thread = useMemo(() => {
    if (!r || !anchor) return null;
    const to = edgeAnchor(r, anchor);
    return { d: threadPath(anchor, to), len: pathLength(anchor, to), to };
  }, [r?.x, r?.y, r?.w, r?.h, anchor]); // eslint-disable-line react-hooks/exhaustive-deps

  const tm = r && ticks ? tickMarks(r) : null;
  // The margin note goes in the right margin when it fits, else the left.
  const noteX = r ? (r.x + r.w + 12 + 200 < viewport.w ? r.x + r.w + 12 : Math.max(8, r.x - 212)) : 0;

  return (
    <div className={`pointer-events-none absolute inset-0 ${reduce ? "pfx-still" : ""}`}>
      <style>{FX_CSS}</style>

      <div aria-hidden="true" className="absolute inset-0">
        <svg width="100%" height="100%" className="absolute inset-0 overflow-visible">
          {r && (
            <g key={`box-${seed}`} className="pfx-lock" data-part="pointer-outline">
              <path d={roundedRect(r, 8)} fill="none" style={{ stroke: "var(--color-accent)", strokeWidth: 2, opacity: strong ? 1 : 0.8 }} />
            </g>
          )}

          {r && tm && (
            <g style={{ stroke: "var(--color-accent)", strokeWidth: 1, opacity: 0.8 }}>
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
                  stroke: "var(--color-accent)",
                  strokeWidth: 1.5,
                  strokeLinecap: "round",
                }}
              />
              <circle cx={thread.to.x} cy={thread.to.y} r={3} style={{ fill: "var(--color-accent)" }} />
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
                style={{ ["--len" as string]: 70, stroke: "var(--color-accent)", strokeWidth: 2, strokeLinecap: "round" }}
              />
            </g>
          )}
        </svg>
      </div>

      {r && ticks && (
        <span
          aria-hidden="true"
          className="absolute whitespace-nowrap rounded border border-line bg-surface px-1.5 text-[12px] leading-4 tabular-nums text-ink-2"
          style={{ left: r.x + r.w, top: r.y - 20, transform: "translateX(-100%)" }}
        >
          {sizeLabel({ width: r.w - 6, height: r.h - 6 })}
        </span>
      )}

      {r && note && typed && (
        <span
          aria-hidden="true"
          className="absolute w-[200px] rounded-md border border-line bg-surface px-2 py-1 text-[12px] leading-5 text-ink-2 shadow-soft"
          style={{ left: noteX, top: r.y + 4 }}
        >
          {typed}
        </span>
      )}

      {caption && (
        <p
          aria-hidden="true"
          className="absolute left-1/2 top-[72px] max-w-[min(640px,calc(100vw-48px))] -translate-x-1/2 truncate rounded-xl border border-line bg-surface px-4 py-1.5 text-[16px] leading-6 text-ink shadow-soft"
        >
          {parts ? (
            <>
              {parts[0]}
              <mark ref={thisRef} className="pfx-hl bg-transparent">{parts[1]}</mark>
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
