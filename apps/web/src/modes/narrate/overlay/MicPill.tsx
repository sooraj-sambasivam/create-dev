import { Lock, Mic, MicOff } from "lucide-react";

export type MicState = "idle" | "listening" | "locked" | "unavailable";

/** Accessible label and tooltip for a mic state. Pure, so it is unit-tested. */
export function micLabel(state: MicState, hint?: string): string {
  const label =
    state === "unavailable"
      ? "Speech recognition isn't available in this browser"
      : state === "locked"
        ? "Mic locked on"
        : state === "listening"
          ? "Listening"
          : "Mic idle";
  return hint ? `${label} · ${hint}` : label;
}

/**
 * Mic status icon with an optional short label. It is rendered inline inside the narrate bar, which
 * owns the placement (see narrateBar.ts), so it has no positioning of its own.
 */
export function MicPill({ state, hint }: { state: MicState; hint?: string }) {
  const unavailable = state === "unavailable";
  const title = micLabel(state, hint);
  const Icon = unavailable ? MicOff : state === "locked" ? Lock : Mic;
  const active = state === "listening" || state === "locked";
  const text = state === "locked" ? "Locked" : unavailable ? "No mic" : null;
  return (
    <span
      role="status"
      aria-label={title}
      title={title}
      data-mic-pill
      className={`inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[12px] ${active ? "bg-accent/12 text-accent" : "bg-tray text-ink-2"}`}
    >
      <Icon size={16} strokeWidth={1.75} className={state === "listening" ? "animate-pulse" : ""} />
      {text}
    </span>
  );
}
