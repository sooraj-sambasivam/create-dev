import { AlertCircle, Radio } from "lucide-react";
import type { LiveSource } from "./liveApi";
import { useLive } from "./useLive";

/** Small token-styled preview of one live source. Used by the composer and the library. */
export function LiveChip({ source, refreshSec = 60, label }: { source: LiveSource; refreshSec?: number; label?: string }) {
  const { state, display, error } = useLive(source, refreshSec);
  const failed = state === "error" && !display;
  const text = failed ? (error ?? "Unavailable") : state === "loading" && !display ? "Loading…" : display;
  const Icon = failed ? AlertCircle : Radio;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-tray px-2.5 py-1 text-[13px] text-ink"
      role="status"
      aria-live="polite"
      title={failed ? undefined : `Live: ${source.id}`}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden className={failed ? "shrink-0 text-bad" : "shrink-0 text-ok"} />
      {label ? <span className="shrink-0 text-ink-2">{label}</span> : null}
      <span className={`truncate ${failed ? "text-bad" : state === "loading" && !display ? "text-ink-3" : ""}`}>{text}</span>
    </span>
  );
}
