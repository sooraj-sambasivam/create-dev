import { Lock, Mic, MicOff } from "lucide-react";

export type MicState = "idle" | "listening" | "locked" | "unavailable";

export function MicPill({ state, hint }: { state: MicState; hint?: string }) {
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
  return (
    <span
      role="status"
      aria-label={title}
      title={title}
      className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] ${active ? "bg-accent/12 text-accent" : "bg-tray text-ink-2"}`}
    >
      <Icon size={16} strokeWidth={1.75} className={state === "listening" ? "animate-pulse" : ""} />
      {text && state !== "listening" ? text : null}
    </span>
  );
}
