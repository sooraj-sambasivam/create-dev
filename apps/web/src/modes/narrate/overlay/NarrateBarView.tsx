import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { MicPill, type MicState } from "./MicPill";
import { button, dot, surface } from "../../../ui/styles";
import { hintPlacement, narrateBarPlacement, type HintMode, type NarrateBarPlacement, type Rect } from "./narrateBar";

const COMPOSER_SELECTOR = "[data-testid='composer']";
const ACTION_ROW_SELECTOR = "[data-testid='action-row']";

type Placed = NarrateBarPlacement & { hint: { mode: HintMode; dx: number } };
const FALLBACK_BAR = { w: 240, h: 32 };

const toRect = (el: Element | null | undefined): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
};

/**
 * Measures the page around the composer and returns where the narrate bar goes. The main card is the
 * nearest <main> around the composer. The header is the card's first child (before [data-builder]).
 * Thread messages are the rows of the conversation log, so the bar can be checked against them.
 */
function measure(barW: number, barH: number): Placed {
  const composer = document.querySelector<HTMLElement>(COMPOSER_SELECTOR);
  const card = composer?.closest("main") ?? document.querySelector("main");
  const first = card?.firstElementChild;
  const header = first && !first.hasAttribute("data-builder") ? first : null;
  const messages = Array.from(card?.querySelectorAll("[role='log'] > *") ?? [])
    .map((el) => toRect(el))
    .filter((r): r is Rect => r !== null);
  const cardRect = toRect(card);
  const headerRect = toRect(header);
  const placed = narrateBarPlacement({
    card: cardRect,
    composerTop: toRect(composer)?.top ?? null,
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
    barW,
    barH,
    header: headerRect,
    avoid: messages,
  });
  // The key hints dock above the bar and keep clear of the thread's action icons.
  const width = Math.min(barW, placed.maxWidth);
  const actions = Array.from(card?.querySelectorAll(ACTION_ROW_SELECTOR) ?? [])
    .map((el) => toRect(el))
    .filter((r): r is Rect => r !== null);
  const hint = hintPlacement({
    bar: { left: placed.left, right: placed.left + width, top: placed.top, bottom: placed.top + barH },
    card: cardRect,
    viewportW: window.innerWidth,
    avoid: actions,
    header: headerRect,
  });
  return { ...placed, hint };
}

/**
 * The narrate "Listening" bar: mic status, elapsed time, the live transcript tail and Done / Cancel.
 * It sits centred on the main card, just above the composer, as one fixed single-line bar. Only the
 * transcript text truncates. It stays inside the overlay root, which is itself fixed to the viewport.
 */
export function NarrateBarView({
  reduce,
  dur,
  elapsed,
  mic,
  micHint,
  text,
  finishing,
  hint,
  onFinish,
  onCancel,
}: {
  reduce: boolean | null;
  dur: number;
  elapsed: ReactNode;
  mic: MicState;
  micHint?: string;
  text: string;
  finishing: boolean;
  /** Always-visible usage hint, docked just above the bar. `compact` is set when the window is narrow or space is tight. */
  hint?: (o: { compact: boolean }) => ReactNode;
  onFinish(): void;
  onCancel(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placed | null>(null);

  useLayoutEffect(() => {
    let observer: ResizeObserver | undefined;
    const place = () => {
      const bar = ref.current;
      const next = measure(bar?.offsetWidth || FALLBACK_BAR.w, bar?.offsetHeight || FALLBACK_BAR.h);
      setPlacement((prev) =>
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.maxWidth === next.maxWidth &&
        prev.clear === next.clear &&
        prev.hint.mode === next.hint.mode &&
        prev.hint.dx === next.hint.dx
          ? prev
          : next,
      );
      // The card, the composer and the bar itself change size when the panel opens or the text grows.
      observer?.disconnect();
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(place);
        const composer = document.querySelector<HTMLElement>(COMPOSER_SELECTOR);
        const card = composer?.closest("main") ?? document.querySelector("main");
        if (card) observer.observe(card);
        if (composer) observer.observe(composer);
        if (bar) observer.observe(bar);
      }
    };
    place();
    window.addEventListener("resize", place);
    // Scrolling the thread moves its action icons under (or out from under) the hint bar.
    window.addEventListener("scroll", place, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, { capture: true });
      observer?.disconnect();
    };
  }, [mic, micHint, text, finishing]);

  return (
    <motion.div
      ref={ref}
      data-narrate-bar
      className={`pointer-events-auto fixed z-[60] flex items-center gap-2 whitespace-nowrap h-10 ${surface.card} p-1 pl-4 text-ink`}
      style={{
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        maxWidth: placement?.maxWidth,
        visibility: placement ? "visible" : "hidden",
      }}
      aria-busy={finishing}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur }}
    >
      {hint && placement && placement.hint.mode !== "hidden" && (
        <span
          data-narrate-hint={placement.hint.mode}
          className={`pointer-events-none absolute bottom-full left-1/2 mb-2 whitespace-nowrap ${surface.pill} ${
            placement.hint.mode === "compact" ? "px-2.5 text-[11px] leading-5" : "px-3 text-[12px] leading-6"
          } text-ink-2`}
          style={{ transform: `translateX(calc(-50% + ${placement.hint.dx}px))` }}
        >
          {hint({ compact: placement.hint.mode === "compact" })}
        </span>
      )}
      <span aria-hidden="true" className={`${dot.bad} shrink-0 ${reduce ? "" : "animate-pulse"}`} />
      <span className="shrink-0 text-[14px] tabular-nums" aria-label="Elapsed time">{elapsed}</span>
      <MicPill state={mic} hint={micHint} />
      <span className="min-w-0 flex-1 truncate text-[14px] text-ink-2" aria-live="polite">
        {text}
      </span>
      <button
        type="button"
        aria-label="Finish narration"
        onClick={onFinish}
        disabled={finishing}
        className={`${button.primary} shrink-0`}
      >
        Done
      </button>
      <button
        type="button"
        aria-label="Cancel narration"
        onClick={onCancel}
        disabled={finishing}
        className={`${button.ghost} shrink-0`}
      >
        Cancel
      </button>
    </motion.div>
  );
}
