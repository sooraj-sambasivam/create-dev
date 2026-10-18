import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { MicPill, type MicState } from "./MicPill";
import { narrateBarPlacement, type NarrateBarPlacement, type Rect } from "./narrateBar";

const COMPOSER_SELECTOR = "[data-testid='composer']";
const FALLBACK_BAR = { w: 240, h: 32 };
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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
function measure(barW: number, barH: number): NarrateBarPlacement {
  const composer = document.querySelector<HTMLElement>(COMPOSER_SELECTOR);
  const card = composer?.closest("main") ?? document.querySelector("main");
  const first = card?.firstElementChild;
  const header = first && !first.hasAttribute("data-builder") ? first : null;
  const messages = Array.from(card?.querySelectorAll("[role='log'] > *") ?? [])
    .map((el) => toRect(el))
    .filter((r): r is Rect => r !== null);
  return narrateBarPlacement({
    card: toRect(card),
    composerTop: toRect(composer)?.top ?? null,
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
    barW,
    barH,
    header: toRect(header),
    avoid: messages,
  });
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
  /** Always-visible usage hint, shown just above the bar. */
  hint?: string;
  onFinish(): void;
  onCancel(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<NarrateBarPlacement | null>(null);

  useLayoutEffect(() => {
    let observer: ResizeObserver | undefined;
    const place = () => {
      const bar = ref.current;
      const next = measure(bar?.offsetWidth || FALLBACK_BAR.w, bar?.offsetHeight || FALLBACK_BAR.h);
      setPlacement((prev) =>
        prev && prev.left === next.left && prev.top === next.top && prev.maxWidth === next.maxWidth && prev.clear === next.clear
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
    return () => {
      window.removeEventListener("resize", place);
      observer?.disconnect();
    };
  }, [mic, micHint, text, finishing]);

  return (
    <motion.div
      ref={ref}
      data-narrate-bar
      className="pointer-events-auto fixed z-[60] flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface p-1 pl-4 text-ink shadow-soft"
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
      {hint && (
        <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded-full border border-line bg-surface px-3 text-[12px] leading-6 text-ink-2">
          {hint}
        </span>
      )}
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full bg-bad ${reduce ? "" : "animate-pulse"}`} />
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
        className={`h-8 shrink-0 rounded-full bg-accent px-3 text-[14px] text-white transition-opacity duration-150 dark:text-shell disabled:opacity-50 ${focusRing}`}
      >
        Done
      </button>
      <button
        type="button"
        aria-label="Cancel narration"
        onClick={onCancel}
        disabled={finishing}
        className={`h-8 shrink-0 rounded-full px-3 text-[14px] text-ink-2 transition-colors duration-150 hover:bg-hover disabled:opacity-50 ${focusRing}`}
      >
        Cancel
      </button>
    </motion.div>
  );
}
