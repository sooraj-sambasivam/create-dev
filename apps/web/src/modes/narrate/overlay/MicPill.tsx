import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Mic, MicOff } from "lucide-react";

export type MicState = "idle" | "listening" | "locked" | "unavailable";

/** Gap between the pill and the header (top dock) or the composer (bottom dock). */
export const MIC_DOCK_GAP = 8;
const FALLBACK_HEADER_H = 48;
/** Header, thread and other chrome. A top slot covered by one of these counts as occupied. */
const OCCUPIED_SELECTOR =
  "header, [data-testid='thread'], [role='log'], [role='status'], [role='alert'], [aria-live], button, [role='button'], input, textarea, form";

export type MicDock = { side: "top" | "bottom"; top: number };

/**
 * Picks where the pill sits. Top centre, MIC_DOCK_GAP below the header, is the default.
 * When that slot is occupied, the pill goes bottom centre, MIC_DOCK_GAP above the composer.
 */
export function micDock(o: { headerBottom: number; composerTop: number | null; viewportH: number; pillH: number; topOccupied: boolean }): MicDock {
  const topSlot = o.headerBottom + MIC_DOCK_GAP;
  if (!o.topOccupied) return { side: "top", top: topSlot };
  const bottomEdge = o.composerTop ?? o.viewportH;
  return { side: "bottom", top: bottomEdge - MIC_DOCK_GAP - o.pillH };
}

/** True when any element under the top slot is header, thread or other chrome. The pill itself is ignored. */
export function isTopOccupied(hits: Pick<Element, "closest">[]): boolean {
  return hits.some((el) => !el.closest("[data-mic-pill]") && el.closest(OCCUPIED_SELECTOR) !== null);
}

export function MicPill({ state, hint }: { state: MicState; hint?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [dock, setDock] = useState<MicDock | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const header = document.querySelector("header");
      const headerBottom = header ? header.getBoundingClientRect().bottom : FALLBACK_HEADER_H;
      const pillH = ref.current?.offsetHeight || 24;
      const slotY = headerBottom + MIC_DOCK_GAP + pillH / 2;
      const hits = typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(window.innerWidth / 2, slotY) : [];
      const composerField = document.querySelector("[data-testid='message-input']");
      const composerTop = composerField?.closest("form")?.getBoundingClientRect().top ?? null;
      setDock(micDock({ headerBottom, composerTop, viewportH: window.innerHeight, pillH, topOccupied: isTopOccupied(hits) }));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
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
      style={dock ? { top: dock.top } : { top: 0, visibility: "hidden" }}
      className={`pointer-events-none fixed left-1/2 z-[60] inline-flex h-6 -translate-x-1/2 items-center gap-1 rounded-full px-2 text-[12px] ${active ? "bg-accent/12 text-accent" : "bg-tray text-ink-2"}`}
    >
      <Icon size={16} strokeWidth={1.75} className={state === "listening" ? "animate-pulse" : ""} />
      {text && state !== "listening" ? text : null}
    </span>
  );
  // Portalled to body so the pill is positioned against the viewport, not the bar it is rendered from.
  return typeof document === "undefined" ? null : createPortal(pill, document.body);
}
