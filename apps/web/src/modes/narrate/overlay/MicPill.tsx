import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Mic, MicOff } from "lucide-react";

export type MicState = "idle" | "listening" | "locked" | "unavailable";

/** Gap between the pill's bottom edge and the composer's top edge. */
export const MIC_DOCK_GAP = 8;
/** Inset from the main card's side edges, so the pill never touches the card's rounded corners. */
export const MIC_CARD_INSET = 8;
const FALLBACK_PILL = { w: 80, h: 24 };
const COMPOSER_SELECTOR = "[data-testid='composer']";

export type Rect = { left: number; right: number; top: number; bottom: number };
export type MicPlacement = { left: number; top: number };

/**
 * Places the pill centred horizontally on the main card and MIC_DOCK_GAP above the composer.
 * It sits inside the card's horizontal extent, so it cannot reach the right panel, and below the
 * header, so it cannot cover the title. Without a composer rect it sits at the card's bottom
 * edge. Without a card rect it uses the viewport, so the bottom centre of the window.
 */
export function micPlacement(o: {
  card: Rect | null;
  composerTop: number | null;
  viewportW: number;
  viewportH: number;
  pillW: number;
  pillH: number;
}): MicPlacement {
  const area: Rect = o.card ?? { left: 0, right: o.viewportW, top: 0, bottom: o.viewportH };
  const minLeft = area.left + MIC_CARD_INSET;
  const maxLeft = Math.max(minLeft, area.right - MIC_CARD_INSET - o.pillW);
  const left = clamp((area.left + area.right) / 2 - o.pillW / 2, minLeft, maxLeft);

  const bottomEdge = o.composerTop ?? area.bottom;
  const minTop = area.top + MIC_CARD_INSET;
  const maxTop = Math.max(minTop, area.bottom - o.pillH);
  const top = clamp(bottomEdge - MIC_DOCK_GAP - o.pillH, minTop, maxTop);
  return { left, top };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

const toRect = (el: Element | null): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
};

export function MicPill({ state, hint }: { state: MicState; hint?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<MicPlacement | null>(null);

  useLayoutEffect(() => {
    let observer: ResizeObserver | undefined;
    const place = () => {
      const composer = document.querySelector<HTMLElement>(COMPOSER_SELECTOR);
      // The main card is the nearest <main>, the work surface AppShell renders around the composer.
      const card = composer?.closest("main") ?? document.querySelector("main");
      const pill = ref.current;
      setPlacement(
        micPlacement({
          card: toRect(card),
          composerTop: toRect(composer)?.top ?? null,
          viewportW: window.innerWidth,
          viewportH: window.innerHeight,
          pillW: pill?.offsetWidth || FALLBACK_PILL.w,
          pillH: pill?.offsetHeight || FALLBACK_PILL.h,
        }),
      );
      // The card and composer change size when the panel opens or the composer grows.
      observer?.disconnect();
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(place);
        if (card) observer.observe(card);
        if (composer) observer.observe(composer);
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      observer?.disconnect();
    };
  }, [state, hint]);

  const unavailable = state === "unavailable";
  const label = unavailable
    ? "Speech recognition isn't available in this browser"
    : state === "locked"
      ? "Mic locked on"
      : state === "listening"
        ? "Listening"
        : "Mic idle";
  const Icon = unavailable ? MicOff : state === "locked" ? Lock : Mic;
  const title = hint ? `${label} · ${hint}` : label;
  const active = state === "listening" || state === "locked";
  const text = state === "locked" ? "Locked" : state === "listening" ? "Listening" : unavailable ? "No mic" : null;
  const pill = (
    <span
      ref={ref}
      role="status"
      aria-label={title}
      title={title}
      data-mic-pill
      style={placement ? { left: placement.left, top: placement.top } : { left: 0, top: 0, visibility: "hidden" }}
      className={`pointer-events-none fixed z-[60] inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] ${active ? "bg-accent/12 text-accent" : "bg-tray text-ink-2"}`}
    >
      <Icon size={16} strokeWidth={1.75} className={state === "listening" ? "animate-pulse" : ""} />
      {text && state !== "listening" ? text : null}
    </span>
  );
  // Portalled to body so the pill is positioned against the viewport, not the bar it is rendered from.
  return typeof document === "undefined" ? null : createPortal(pill, document.body);
}
