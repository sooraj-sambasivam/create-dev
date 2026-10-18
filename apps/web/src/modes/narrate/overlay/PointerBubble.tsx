import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Code2, Crosshair, MessageSquare } from "lucide-react";
import { findNodeById, humanLabel, nodeLabel, PANEL_PAGE_ROOT, type HoverHit } from "./targets";
import { pinnedChip } from "./pointerLogic";
import { useScreenStore } from "../../../store/screenStore";
import { useWorkMode } from "../../../store/modeStore";
import { usePin } from "../../../narrate/pinStore";
import { hasAnswerSink, sendAnswerToChat } from "../../../narrate/answerSink";
import type { PagePointer } from "./usePagePointer";
import { button, ICON, STROKE, surface } from "../../../ui/styles";
import { useLook } from "../../../ui/look";
import { spring } from "../../../ui/motion";
import { ActionCard } from "./ActionCard";
import { ConfidenceMeter, PointerFx, type FxRect } from "./PointerFx";
import { SeenOnPage } from "./SeenOnPage";
import { deriveEntities, type Entity } from "./entities";
import type { PointerAction } from "./pointerActions";
import { buildWidenChain, confidence, dwellLevel, stepDwell, WIDEN_STEP_MS, type DwellState, type WidenEl, type WidenLevel } from "./widen";

/** What the pointer is doing with the last thing said. */
export type PointerPhase =
  | { kind: "idle" }
  | { kind: "listening"; targetId: string | null; label: string | null }
  | { kind: "understanding"; targetId: string | null; label: string | null }
  | { kind: "editing"; targetId: string | null; label: string | null }
  | { kind: "done"; targetId: string | null; label: string | null; message?: string; undoable?: boolean }
  | { kind: "cancelled" }
  | { kind: "failed"; targetId: string | null; label: string | null; message: string }
  | { kind: "ask"; message: string }
  | { kind: "answer"; targetId: string | null; label: string | null; question: string; answer: string; suggestCode?: boolean };

const STATUS: Record<Exclude<PointerPhase["kind"], "idle">, string> = {
  listening: "Listening…",
  understanding: "Understanding…",
  editing: "Editing…",
  done: "Done",
  failed: "Couldn't do that",
  cancelled: "Canceled",
  ask: "",
  answer: "",
};

/** The text after the label: a status word, or the result message when there is one. */
export function phaseText(phase: PointerPhase, slow = false): string {
  if (phase.kind === "idle") return "";
  if (slow && (phase.kind === "understanding" || phase.kind === "editing")) return STILL_WORKING;
  if (phase.kind === "ask") return phase.message;
  if (phase.kind === "failed" || phase.kind === "done") {
    const m = phase.message?.trim();
    return m ? `${STATUS[phase.kind]} · ${m.slice(0, 60)}` : STATUS[phase.kind];
  }
  return STATUS[phase.kind];
}

/** Understanding or Editing for this long shows "Still working…". */
export const SLOW_MS = 1000;
const STILL_WORKING = "Still working…";

/** What a screen reader hears for a phase: the target, then the status or the answer. */
export function phaseAnnouncement(phase: PointerPhase, label: string | null, slow = false): string {
  if (phase.kind === "idle") return "";
  if (phase.kind === "answer") return phase.answer;
  if (phase.kind === "ask") return phase.message;
  const status = phaseText(phase, slow).replace(/…$/, "");
  return label && phase.kind !== "cancelled" ? `${label}. ${status}` : status;
}

/** Slow-state flag: true once the phase has sat in Understanding or Editing for SLOW_MS. */
function useSlow(phase: PointerPhase): boolean {
  const [slow, setSlow] = useState(false);
  const working = phase.kind === "understanding" || phase.kind === "editing";
  useEffect(() => {
    if (!working) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, [working]);
  return working && slow;
}

/**
 * Visually hidden polite live region for the pointer. Keep it mounted (the bubble itself unmounts when idle),
 * so a screen reader hears Listening, the target, Done and the answer text.
 */
export function PointerLiveRegion({ phase }: { phase: PointerPhase }) {
  const screen = useScreenStore((st) => st.screen);
  const slow = useSlow(phase);
  const named = phase.kind !== "idle" && phase.kind !== "ask" && phase.kind !== "cancelled" && phase.label ? phase : null;
  const label = named ? humanLabel(named.targetId ?? "", screen, named.label ?? "") : null;
  return <div aria-live="polite" role="status" data-narrate-ignore className="sr-only">{phaseAnnouncement(phase, label, slow)}</div>;
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
  if (above >= 4) return { x, y: above };
  const below = el.top + el.height + 2 + EDGE_GAP;
  if (below + chip.h <= viewport.h - 4 || chip.h <= 60) return { x, y: Math.min(below, Math.max(4, viewport.h - chip.h - 4)) };
  // A tall chip (the action card) fits neither above nor below: put it beside the element, level with the cursor.
  const y = Math.min(Math.max(4, cursor.y - 24), Math.max(4, viewport.h - chip.h - 4));
  if (el.left - EDGE_GAP - chip.w >= 8) return { x: el.left - EDGE_GAP - chip.w, y };
  if (el.left + el.width + EDGE_GAP + chip.w <= viewport.w - 8) return { x: el.left + el.width + EDGE_GAP, y };
  return { x, y: Math.min(below, Math.max(4, viewport.h - chip.h - 4)) };
}

const RING_DELAY_MS = 150;
const sameRect = (a: FxRect | null, b: FxRect | null) =>
  a === b || (!!a && !!b && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

const pageNode = (id: string) => document.querySelector<HTMLElement>(`${PANEL_PAGE_ROOT} [data-node-id="${CSS.escape(id)}"]`);

/**
 * Chip next to the cursor naming the page element it points at ("Heading · Welcome"), then the progress of
 * the command (Listening, Understanding, Editing, Done or Couldn't do that). The chip moves through a ref, so
 * a pointer move never re-renders the chip text. Resting on a table cell widens the target (cell, row, table,
 * section) every 450ms, and `]` / `[` widen or narrow by hand. Pinning a target opens the chip into the action
 * card. The marks around the target are drawn per look (see PointerFx). Only the card and the page list take
 * pointer events.
 */
export function PointerBubble({
  pointer,
  phase,
  reduce,
  onUndo,
  transcript = "",
  onAction,
}: {
  pointer: PagePointer;
  phase: PointerPhase;
  reduce: boolean | null;
  onUndo?: () => void;
  /** The live spoken line; its "this" gets the highlighter and the thread. */
  transcript?: string;
  /** The action card's pick, for the pinned target. */
  onAction?: (action: PointerAction, target: { id: string; label: string }) => void;
}) {
  const look = useLook((st) => st.look);
  const slow = useSlow(phase);
  const chip = useRef<HTMLDivElement>(null);
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

  // Widen: the chain under the pointer, the dwell that climbs it, and the hand-set offset from [ and ].
  const chain = useRef<WidenLevel[]>([]);
  const lastUnder = useRef<Element | null>(null);
  const dwell = useRef<DwellState | null>(null);
  const dwellLvl = useRef(0);
  const manual = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [lvTick, setLvTick] = useState(0);
  const [ring, setRing] = useState<{ key: string; show: boolean } | null>(null);
  const previewId = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rect, setRect] = useState<FxRect | null>(null);
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  const effLevel = () => Math.max(0, Math.min(chain.current.length - 1, dwellLvl.current + manual.current));

  const place = () => {
    const p = phaseRef.current;
    const bound = p.kind !== "idle" && p.kind !== "ask" && p.kind !== "cancelled" && p.targetId ? pageNode(p.targetId) : null;
    const pin = pinRef.current;
    // The pinned node is looked up by id, so an edit that re-rendered it does not lose the outline.
    const pinEl = pin ? pageNode(pin.id) ?? (pin.el as HTMLElement | undefined) ?? null : null;
    const previewEl = previewId.current ? pageNode(previewId.current) : null;
    const lv = chain.current[effLevel()];
    const widened = lv ? (lv.el as unknown as HTMLElement) : null;
    const el = previewEl ?? bound ?? (pinEl?.isConnected ? pinEl : null) ?? widened ?? hoverEl.current;
    const r = el?.getBoundingClientRect();
    const c = chip.current;
    if (c) {
      const pos = chipPosition({ el: r ?? null, cursor: cursorAt.current, chip: { w: c.offsetWidth, h: c.offsetHeight }, viewport: { w: window.innerWidth, h: window.innerHeight } });
      c.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    }
    const next: FxRect | null = r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    setRect((prev) => (sameRect(prev, next) ? prev : next));
  };

  /** Re-reads the dwell: sets the level it has reached, shows the progress ring, and wakes at the next boundary. */
  const schedule = () => {
    clearTimeout(timer.current);
    const d = dwell.current;
    const len = chain.current.length;
    if (!d || len <= 1) {
      setRing(null);
      return;
    }
    const now = Date.now();
    const lvl = dwellLevel(d, now, len);
    if (lvl !== dwellLvl.current) {
      dwellLvl.current = lvl;
      setLvTick((n) => n + 1);
      place();
    }
    if (lvl >= len - 1) {
      setRing(null);
      return;
    }
    const ringAt = d.since + lvl * WIDEN_STEP_MS + RING_DELAY_MS;
    const boundary = d.since + (lvl + 1) * WIDEN_STEP_MS;
    if (now < ringAt) {
      setRing(null);
      timer.current = setTimeout(schedule, ringAt - now + 1);
    } else {
      setRing({ key: `${d.since}-${lvl}`, show: true });
      timer.current = setTimeout(schedule, boundary - now + 1);
    }
  };

  useEffect(() => {
    const move = (s: { x: number; y: number; hit: HoverHit | null }) => {
      hoverEl.current = s.hit?.el ?? null;
      cursorAt.current = { x: s.x, y: s.y };
      setHover(s.hit ? { id: s.hit.id, label: s.hit.label } : null);
      const pageRoot = s.hit ? document.querySelector(PANEL_PAGE_ROOT) : null;
      // The top element inside the page. Layers above it (the lasso, edit-mode wrappers) are skipped, so a table
      // cell under a transparent wrapper is still found.
      const stack = pageRoot && typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(s.x, s.y).filter((e) => pageRoot.contains(e)) : [];
      const under = stack.find((e) => e.closest("td,th")) ?? stack[0] ?? null;
      if (!s.hit) {
        chain.current = [];
        lastUnder.current = null;
      } else if (under !== lastUnder.current || chain.current.length === 0 || chain.current[chain.current.length - 1].kind === "table" || chain.current.some((l) => l.kind === "cell")) {
        lastUnder.current = under;
        const tree = useScreenStore.getState().screen?.children;
        chain.current = buildWidenChain(
          under as unknown as WidenEl | null,
          { id: s.hit.id, el: s.hit.el as unknown as WidenEl },
          humanLabel(s.hit.id, useScreenStore.getState().screen, s.hit.label),
          pageRoot as unknown as { contains(n: never): boolean } | null,
          (id) => (findNodeById(tree, id)?.type as string | undefined) ?? null,
          { x: s.x, y: s.y },
        );
      }
      const key = s.hit && chain.current[0] ? `${s.hit.id}|${chain.current[0].label}` : "";
      const next = stepDwell(dwell.current, { t: Date.now(), x: s.x, y: s.y, key });
      if (next !== dwell.current) {
        dwell.current = next;
        dwellLvl.current = 0;
        manual.current = 0;
        setLvTick((n) => n + 1);
      }
      schedule();
      place();
    };
    const latest = pointer.latest();
    if (latest) move(latest);
    const off = pointer.subscribe(move);
    return () => {
      off();
      clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointer]);

  useEffect(place, [phase, hover, screen, pinned, preview, lvTick, !!pinned]);

  // Scrolling moves the page under a still pointer: re-measure the outline (rAF-throttled, capture reaches nested scrollers).
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(); });
    };
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      onScroll();
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // [ and ] widen or narrow by hand, for people who cannot hold the pointer still.
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if ((e.key !== "[" && e.key !== "]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (chain.current.length <= 1) return;
      e.preventDefault();
      const want = effLevel() + (e.key === "]" ? 1 : -1);
      manual.current += Math.max(0, Math.min(chain.current.length - 1, want)) - effLevel();
      setLvTick((n) => n + 1);
      place();
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entities = useMemo<Entity[]>(() => deriveEntities(screen?.children), [screen]);
  const bindEntity = (e: Entity) => {
    const el = pageNode(e.id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    usePin.getState().pin({
      id: e.id,
      label: nodeLabel(e.kind, e.detail),
      area: r.width * r.height,
      box: { x: r.left, y: r.top, w: r.width, h: r.height },
      el,
    });
  };

  const active = phase.kind !== "idle";
  const bound = phase.kind !== "idle" && phase.kind !== "ask" && phase.kind !== "cancelled" && phase.label ? phase : null;
  const eff = effLevel();
  // A pinned, bound or previewed target beats the hover chain, so its widen level must not leak into the label.
  const fixed = Boolean(pinned) || Boolean(preview) || Boolean(phase.kind !== "idle" && phase.kind !== "ask" && phase.kind !== "cancelled" && phase.targetId);
  const lv = fixed ? null : (chain.current[eff] ?? null);
  const previewEnt = preview ? entities.find((e) => e.id === preview) : null;
  const label = previewEnt
    ? humanLabel(previewEnt.id, screen, nodeLabel(previewEnt.kind, previewEnt.detail))
    : bound
      ? humanLabel(bound.targetId ?? "", screen, bound.label ?? "")
      : pinned
        ? pinnedChip(humanLabel(pinned.id, screen, pinned.label))
        : lv
          ? lv.label
          : hover ? humanLabel(hover.id, screen, hover.label) : null;
  const status = phaseText(phase, slow);
  const show = Boolean(label) || phase.kind === "ask" || phase.kind === "answer" || phase.kind === "cancelled";
  const answer = phase.kind === "answer" ? phase : null;
  const card = Boolean(pinned) && phase.kind === "idle";
  const action = `${button.ghost} pointer-events-auto h-6 rounded-md px-2 text-[12px]`;
  const tone = phase.kind === "failed" ? "text-bad" : phase.kind === "done" ? "text-ok" : "text-ink-2";
  const strong = Boolean(pinned) || (active && phase.kind !== "cancelled");
  const targetId = pinned?.id ?? (phase.kind !== "idle" && phase.kind !== "ask" && phase.kind !== "cancelled" ? phase.targetId : null) ?? lv?.nodeId ?? hover?.id ?? "";
  const detail = label && label.includes(" · ") ? label.split(" · ").slice(1).join(" · ") : label;
  const entity = entities.find((e) => e.id === targetId);
  const note = rect && !card && (strong || eff > 0) ? (lv?.note ?? entity?.detail ?? detail) : null;
  const caption = phase.kind === "listening" || phase.kind === "understanding" || phase.kind === "editing" ? transcript.trim() || null : null;
  const conf = lv ? confidence(lv.kind, eff > 0) : label ? 0.9 : null;
  const pinLabel = pinned ? humanLabel(pinned.id, screen, pinned.label) : "";
  void lvTick;

  return (
    <>
      {/* Marks and the dimmed room sit under the narrate bar (z-60), so the bar is never dimmed. */}
      <div data-narrate-ignore aria-hidden="true" className="pointer-events-none fixed inset-0 z-[59]">
        <PointerFx
          look={look}
          rect={rect}
          seed={`${targetId}:${lv?.kind ?? "x"}`}
          strong={strong || Boolean(preview)}
          reduce={reduce}
          ticks={Boolean(pinned) || (!fixed && eff > 0)}
          note={note}
          caption={caption}
          cursor={cursorAt.current}
          ring={ring}
          viewport={viewport}
        />
      </div>
      <div data-narrate-ignore className="pointer-events-none fixed inset-0 z-[102]">
        <div
          ref={chip}
          className="absolute left-0 top-0 flex max-w-[320px] flex-col items-start gap-1.5"
          style={{ opacity: show ? 1 : 0, transition: reduce ? "none" : "opacity 120ms" }}
        >
          <motion.div
            layout={reduce ? false : "position"}
            transition={spring.gentle}
            className={`max-w-full border border-line bg-surface shadow-soft ${card ? "" : "whitespace-nowrap"}`}
            style={{ borderRadius: card ? 14 : 999 }}
          >
            {card ? (
              <ActionCard
                label={pinLabel}
                onAction={(a) => pinned && onAction?.(a, { id: pinned.id, label: pinLabel })}
              />
            ) : (
              <div aria-hidden="true" className="flex max-w-full items-center gap-1.5 px-2.5 text-[12px] leading-6 text-ink">
                <Crosshair size={ICON.md} strokeWidth={STROKE} className={active ? "shrink-0 text-accent" : "shrink-0 text-ink-2"} />
                {phase.kind !== "ask" && label && <span className="min-w-0 max-w-[150px] shrink-0 truncate">{label}</span>}
                {status && <span className={`min-w-0 truncate ${tone}`}>{phase.kind === "ask" || !label ? status : `· ${status}`}</span>}
                {conf !== null && label && (phase.kind === "idle" || phase.kind === "listening" || phase.kind === "understanding") && <ConfidenceMeter look={look} value={conf} />}
                {phase.kind === "done" && phase.undoable && onUndo && (
                  <button type="button" className={`${action} -mr-1.5`} onClick={onUndo}>Undo</button>
                )}
              </div>
            )}
          </motion.div>
          {answer && (
            <div className={`w-full ${surface.card} p-2.5 text-[12px] leading-5 text-ink`}>
              <p className="line-clamp-3 whitespace-pre-wrap" title={answer.answer}>{answer.answer}</p>
              {(answer.suggestCode || hasAnswerSink()) && (
                <div className="-mx-1 mt-1.5 flex gap-1">
                  {answer.suggestCode && (
                    <button type="button" className={action} onClick={() => setMode("code")}>
                      <Code2 size={ICON.md} strokeWidth={STROKE} />Switch to Code
                    </button>
                  )}
                  {hasAnswerSink() && (
                    <button type="button" className={action} onClick={() => sendAnswerToChat(answer.question, answer.answer)}>
                      <MessageSquare size={ICON.md} strokeWidth={STROKE} />More in chat
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="absolute bottom-24 right-5">
          <SeenOnPage
            entities={entities}
            activeId={pinned?.id ?? preview}
            onPreview={(id) => {
              previewId.current = id;
              setPreview(id);
            }}
            onBind={bindEntity}
          />
        </div>
      </div>
    </>
  );
}
