import { useEffect, useState } from "react";
import { Check, Loader2, Mic, MicOff, RotateCcw, Square, TriangleAlert, X } from "lucide-react";
import { formatElapsed, type VoiceState } from "./voice";
import { BROWSER_SPEECH_HINT, type VoiceEngine } from "./speech";

const ICON = { size: 16, strokeWidth: 1.75 } as const;
const actionBtn =
  "grid h-6 shrink-0 place-items-center rounded-full px-2 text-[12px] leading-4 text-[var(--c-ink-2)] hover:bg-[var(--c-hover)] focus-visible:outline-2 focus-visible:outline-[var(--c-accent)]";

/**
 * Voice bar. Fills the composer's control row (h-8) in every phase; each phase is one
 * icon slot, one truncating label and at most one fixed-size action, so nothing shifts.
 */
export function VoiceBar({
  state,
  level,
  engine = "server",
  onStop,
  onRetry,
  onDismiss,
}: {
  state: VoiceState;
  level: number;
  engine?: VoiceEngine;
  onStop: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { phase, message } = state;
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (phase !== "listening") return;
    const t0 = Date.now();
    setStartedAt(t0);
    setNow(t0);
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  let icon = <Mic {...ICON} />;
  let label = "";
  let tone = "text-[var(--c-ink-2)]";
  let tail: React.ReactNode = null;
  let title: string | undefined;

  switch (phase) {
    case "requesting":
      icon = <Mic {...ICON} />;
      label = engine === "browser" ? BROWSER_SPEECH_HINT : "Allow microphone access…";
      break;
    case "listening":
      icon = <Mic {...ICON} className="text-[var(--c-bad)]" />;
      label = engine === "browser" ? BROWSER_SPEECH_HINT : "Listening";
      tail = (
        <>
          <span aria-hidden="true" className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--c-line)]">
            <span
              className="block h-full w-full origin-left rounded-full bg-[var(--c-bad)] transition-transform duration-75"
              style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, level))})` }}
            />
          </span>
          <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-[var(--c-ink-2)]">{formatElapsed(now - startedAt)}</span>
          <button type="button" aria-label="Stop recording" title="Stop recording" onClick={onStop} className={`${actionBtn} w-6 !px-0`}>
            <Square size={10} strokeWidth={0} fill="currentColor" />
          </button>
        </>
      );
      break;
    case "transcribing":
      icon = <Loader2 {...ICON} className="animate-spin" />;
      label = engine === "browser" ? BROWSER_SPEECH_HINT : "Transcribing…";
      break;
    case "done":
      icon = <Check {...ICON} className="text-[var(--c-accent)]" />;
      label = "Got it";
      break;
    case "error":
      icon = <TriangleAlert {...ICON} />;
      tone = "text-[var(--c-bad)]";
      label = message ?? "Something went wrong.";
      title = label;
      tail = (
        <button type="button" onClick={onRetry} className={`${actionBtn} gap-1 !inline-flex items-center`}>
          <RotateCcw size={12} strokeWidth={1.75} aria-hidden="true" />
          Retry
        </button>
      );
      break;
    case "unavailable":
      icon = <MicOff {...ICON} />;
      label = "Microphone unavailable";
      title = message ?? undefined;
      tail = (
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className={`${actionBtn} w-6 !px-0`}>
          <X size={14} strokeWidth={1.75} />
        </button>
      );
      break;
    default:
      return null;
  }

  return (
    <div
      role={phase === "error" ? "alert" : "status"}
      aria-live="polite"
      title={title}
      data-testid="voice-bar"
      data-phase={phase}
      className={`flex h-8 min-w-0 items-center gap-2 rounded-full bg-[var(--c-tray)] pr-1.5 pl-3 text-[14px] leading-5 ${tone} ${
        phase === "unavailable" ? "opacity-70" : ""
      }`}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {tail}
    </div>
  );
}
