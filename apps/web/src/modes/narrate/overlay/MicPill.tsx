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
  return (
    <span
      role="status"
      aria-label={title}
      title={title}
      className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px]"
      style={{
        background: active ? "color-mix(in srgb, var(--accent, #3E7BF0) 12%, transparent)" : "var(--tray, #F4F4F4)",
        color: active ? "var(--accent, #3E7BF0)" : "var(--ink-2, #5D5D5D)",
      }}
    >
      <Icon size={16} strokeWidth={1.75} className={state === "listening" ? "animate-pulse" : ""} />
      {state === "locked" ? "Locked" : state === "listening" ? "Listening" : unavailable ? "No mic" : "Idle"}
      {hint && !unavailable ? <span className="ml-0.5 max-w-[190px] truncate" style={{ color: "var(--ink-2, #5D5D5D)" }}>{hint}</span> : null}
    </span>
  );
}
