import { useEffect, useRef, useState } from "react";
import { Crosshair } from "lucide-react";
import { prettyLabel, type HoverHit } from "./targets";
import type { PagePointer } from "./usePagePointer";

/** What the pointer is doing with the last thing said. */
export type PointerPhase =
  | { kind: "idle" }
  | { kind: "listening"; targetId: string | null; label: string | null }
  | { kind: "understanding"; targetId: string | null; label: string | null }
  | { kind: "editing"; targetId: string | null; label: string | null }
  | { kind: "done"; targetId: string | null; label: string | null; message?: string }
  | { kind: "failed"; targetId: string | null; label: string | null; message: string }
  | { kind: "ask"; message: string };

const STATUS: Record<Exclude<PointerPhase["kind"], "idle">, string> = {
  listening: "Listening…",
  understanding: "Understanding…",
  editing: "Editing…",
  done: "Done",
  failed: "Couldn't do that",
  ask: "",
};

/** The text after the label: a status word, or the result message when there is one. */
export function phaseText(phase: PointerPhase): string {
  if (phase.kind === "idle") return "";
  if (phase.kind === "ask") return phase.message;
  if (phase.kind === "failed" || phase.kind === "done") {
    const m = phase.message?.trim();
    return m ? `${STATUS[phase.kind]} · ${m.slice(0, 60)}` : STATUS[phase.kind];
  }
  return STATUS[phase.kind];
}

const OFFSET = 14;

/**
 * Chip next to the cursor naming the page element it points at ("Heading · Welcome"), then the progress of
 * the command (Listening, Understanding, Editing, Done or Couldn't do that). The chip and the 2px outline
 * move through refs, so a pointer move never re-renders React. It never takes pointer events.
 */
export function PointerBubble({ pointer, phase, reduce }: { pointer: PagePointer; phase: PointerPhase; reduce: boolean | null }) {
  const chip = useRef<HTMLDivElement>(null);
  const outline = useRef<HTMLDivElement>(null);
  const hoverEl = useRef<HoverHit["el"] | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [hover, setHover] = useState<string | null>(null);

  const place = () => {
    const p = phaseRef.current;
    const bound = p.kind !== "idle" && p.kind !== "ask" && p.targetId ? document.querySelector<HTMLElement>(`[data-right-panel] [data-screen-root] [data-node-id="${CSS.escape(p.targetId)}"]`) : null;
    const el = bound ?? hoverEl.current;
    const box = outline.current;
    if (!box) return;
    if (!el) { box.style.opacity = "0"; return; }
    const r = el.getBoundingClientRect();
    box.style.opacity = "1";
    box.style.transform = `translate(${r.left - 2}px, ${r.top - 2}px)`;
    box.style.width = `${r.width + 4}px`;
    box.style.height = `${r.height + 4}px`;
  };

  useEffect(() => {
    const move = (s: { x: number; y: number; hit: HoverHit | null }) => {
      hoverEl.current = s.hit?.el ?? null;
      const c = chip.current;
      if (c) {
        const w = c.offsetWidth;
        const x = s.x + OFFSET + w > window.innerWidth ? s.x - OFFSET - w : s.x + OFFSET;
        c.style.transform = `translate(${Math.max(8, x)}px, ${s.y + OFFSET}px)`;
      }
      setHover(s.hit ? s.hit.label : null);
      place();
    };
    const latest = pointer.latest();
    if (latest) move(latest);
    return pointer.subscribe(move);
  }, [pointer]);

  useEffect(place, [phase]);

  // Scrolling moves the page under a still pointer: re-measure the outline (rAF-throttled, capture reaches nested scrollers).
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(); });
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const active = phase.kind !== "idle";
  const label = phase.kind !== "idle" && phase.kind !== "ask" && phase.label ? phase.label : hover;
  const status = phaseText(phase);
  const show = Boolean(label) || phase.kind === "ask";
  const tone = phase.kind === "failed" ? "text-bad" : phase.kind === "done" ? "text-ok" : "text-ink-2";

  return (
    <div data-narrate-ignore aria-hidden="true" className="pointer-events-none fixed inset-0 z-[102]">
      <div
        ref={outline}
        className="absolute left-0 top-0 rounded-md"
        style={{ opacity: 0, boxShadow: "0 0 0 2px var(--color-accent)", transition: reduce ? "none" : "opacity 120ms" }}
      />
      <div
        ref={chip}
        className="absolute left-0 top-0 flex max-w-[320px] items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 text-[12px] leading-6 text-ink shadow-soft"
        style={{ opacity: show ? 1 : 0, transition: reduce ? "none" : "opacity 120ms" }}
      >
        <Crosshair size={12} strokeWidth={1.75} className={active ? "shrink-0 text-accent" : "shrink-0 text-ink-2"} />
        {phase.kind !== "ask" && label && <span className="min-w-0 truncate">{prettyLabel(label)}</span>}
        {status && <span className={`shrink-0 ${tone}`}>{phase.kind === "ask" || !label ? status : `· ${status}`}</span>}
      </div>
    </div>
  );
}
