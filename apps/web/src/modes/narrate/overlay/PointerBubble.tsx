import { useEffect, useRef, useState } from "react";
import { Code2, Crosshair, MessageSquare } from "lucide-react";
import { humanLabel, type HoverHit } from "./targets";
import { pinnedChip } from "./pointerLogic";
import { useScreenStore } from "../../../store/screenStore";
import { useWorkMode } from "../../../store/modeStore";
import { usePin } from "../../../narrate/pinStore";
import { hasAnswerSink, sendAnswerToChat } from "../../../narrate/answerSink";
import type { PagePointer } from "./usePagePointer";

/** What the pointer is doing with the last thing said. */
export type PointerPhase =
  | { kind: "idle" }
  | { kind: "listening"; targetId: string | null; label: string | null }
  | { kind: "understanding"; targetId: string | null; label: string | null }
  | { kind: "editing"; targetId: string | null; label: string | null }
  | { kind: "done"; targetId: string | null; label: string | null; message?: string }
  | { kind: "failed"; targetId: string | null; label: string | null; message: string }
  | { kind: "ask"; message: string }
  | { kind: "answer"; targetId: string | null; label: string | null; question: string; answer: string; suggestCode?: boolean };

const STATUS: Record<Exclude<PointerPhase["kind"], "idle">, string> = {
  listening: "Listening…",
  understanding: "Understanding…",
  editing: "Editing…",
  done: "Done",
  failed: "Couldn't do that",
  ask: "",
  answer: "",
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
const EDGE_GAP = 6;

/**
 * Where the chip goes. Next to an element it sits on the element's outline: just above its top-left corner,
 * or just below its bottom-left corner when there is no room above. With no element it follows the cursor.
 */
export function chipPosition(o: {
  el: { left: number; top: number; width: number; height: number } | null;
  cursor: { x: number; y: number };
  chip: { w: number; h: number };
  viewport: { w: number; h: number };
}): { x: number; y: number } {
  const { el, cursor, chip, viewport } = o;
  if (!el) {
    const x = cursor.x + OFFSET + chip.w > viewport.w ? cursor.x - OFFSET - chip.w : cursor.x + OFFSET;
    return { x: Math.max(8, x), y: cursor.y + OFFSET };
  }
  const x = Math.min(Math.max(8, el.left - 2), Math.max(8, viewport.w - chip.w - 8));
  const above = el.top - 2 - EDGE_GAP - chip.h;
  const y = above >= 4 ? above : Math.min(el.top + el.height + 2 + EDGE_GAP, Math.max(4, viewport.h - chip.h - 4));
  return { x, y };
}

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
  const cursorAt = useRef({ x: 0, y: 0 });
  const [hover, setHover] = useState<{ id: string; label: string } | null>(null);
  const screen = useScreenStore((st) => st.screen);
  const pinned = usePin((st) => st.pinned);
  const pinRef = useRef(pinned);
  pinRef.current = pinned;
  const setMode = useWorkMode((st) => st.setMode);

  const place = () => {
    const p = phaseRef.current;
    const bound = p.kind !== "idle" && p.kind !== "ask" && p.targetId ? document.querySelector<HTMLElement>(`[data-right-panel] [data-screen-root] [data-node-id="${CSS.escape(p.targetId)}"]`) : null;
    const pin = pinRef.current;
    // The pinned node is looked up by id, so an edit that re-rendered it does not lose the outline.
    const pinEl = pin ? document.querySelector<HTMLElement>(`[data-right-panel] [data-screen-root] [data-node-id="${CSS.escape(pin.id)}"]`) ?? (pin.el as HTMLElement | undefined) ?? null : null;
    const el = bound ?? (pinEl?.isConnected ? pinEl : null) ?? hoverEl.current;
    const box = outline.current;
    if (!box) return;
    const r = el?.getBoundingClientRect();
    const c = chip.current;
    if (c) {
      const pos = chipPosition({ el: r ?? null, cursor: cursorAt.current, chip: { w: c.offsetWidth, h: c.offsetHeight }, viewport: { w: window.innerWidth, h: window.innerHeight } });
      c.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    }
    if (!r) { box.style.opacity = "0"; return; }
    box.style.opacity = "1";
    box.style.transform = `translate(${r.left - 2}px, ${r.top - 2}px)`;
    box.style.width = `${r.width + 4}px`;
    box.style.height = `${r.height + 4}px`;
  };

  useEffect(() => {
    const move = (s: { x: number; y: number; hit: HoverHit | null }) => {
      hoverEl.current = s.hit?.el ?? null;
      cursorAt.current = { x: s.x, y: s.y };
      setHover(s.hit ? { id: s.hit.id, label: s.hit.label } : null);
      place();
    };
    const latest = pointer.latest();
    if (latest) move(latest);
    return pointer.subscribe(move);
  }, [pointer]);

  useEffect(place, [phase, hover, screen, pinned]);

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
  const bound = phase.kind !== "idle" && phase.kind !== "ask" && phase.label ? phase : null;
  const label = bound
    ? humanLabel(bound.targetId ?? "", screen, bound.label ?? "")
    : pinned ? pinnedChip(humanLabel(pinned.id, screen, pinned.label))
    : hover ? humanLabel(hover.id, screen, hover.label) : null;
  const status = phaseText(phase);
  const show = Boolean(label) || phase.kind === "ask" || phase.kind === "answer";
  const answer = phase.kind === "answer" ? phase : null;
  const action = "pointer-events-auto flex h-6 items-center gap-1 rounded-md px-2 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
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
        className="absolute left-0 top-0 flex max-w-[320px] flex-col items-start gap-1.5"
        style={{ opacity: show ? 1 : 0, transition: reduce ? "none" : "opacity 120ms" }}
      >
        <div className="flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 text-[12px] leading-6 text-ink shadow-soft">
          <Crosshair size={12} strokeWidth={1.75} className={active ? "shrink-0 text-accent" : "shrink-0 text-ink-2"} />
          {phase.kind !== "ask" && label && <span className="min-w-0 truncate">{label}</span>}
          {status && <span className={`shrink-0 ${tone}`}>{phase.kind === "ask" || !label ? status : `· ${status}`}</span>}
        </div>
        {answer && (
          <div className="w-full rounded-xl border border-line bg-surface p-2.5 text-[12px] leading-5 text-ink shadow-soft">
            <p className="line-clamp-3 whitespace-pre-wrap" title={answer.answer}>{answer.answer}</p>
            {(answer.suggestCode || hasAnswerSink()) && (
              <div className="-mx-1 mt-1.5 flex gap-1">
                {answer.suggestCode && (
                  <button type="button" className={action} onClick={() => setMode("code")}>
                    <Code2 size={12} strokeWidth={1.75} />Switch to Code
                  </button>
                )}
                {hasAnswerSink() && (
                  <button type="button" className={action} onClick={() => sendAnswerToChat(answer.question, answer.answer)}>
                    <MessageSquare size={12} strokeWidth={1.75} />More in chat
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
