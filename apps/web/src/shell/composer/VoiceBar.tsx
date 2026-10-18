import { useEffect, useState } from "react";
import { Check, Loader2, Mic, MicOff, RotateCcw, TriangleAlert, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { formatElapsed, isDenied, isUnsupported, type VoiceState } from "./voice";
import { BROWSER_SPEECH_HINT, type VoiceEngine } from "./speech";

const ICON = { size: 16, strokeWidth: 1.75 } as const;
/** The bar is one h-8 line, so longer error copy is replaced by a short fallback. */
const ERROR_LINE_MAX = 60;
const actionBtn =
  "inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full px-2 text-[12px] leading-4 text-[var(--c-ink-2)] hover:bg-[var(--c-hover)] hover:text-[var(--c-ink)] focus-visible:outline-2 focus-visible:outline-[var(--c-accent)]";

/**
 * Voice bar. Fills the composer's control row (h-8) in every phase; each phase is one
 * icon slot, one truncating label and at most one fixed-size action, so nothing shifts.
 */
export function VoiceBar({
  state,
  level,
  engine = "server",
  onRetry,
  onDismiss,
}: {
  state: VoiceState;
  level: number;
  engine?: VoiceEngine;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { phase, message } = state;
  const reduce = useReducedMotion();
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  // Below this level the meter stays empty, so a quiet mic never shows a stray dot.
  const fill = level < 0.02 ? 0 : Math.min(1, level);

  // Long server errors are cut to a short line in the bar; the full text is logged for debugging.
  useEffect(() => {
    if (phase === "error" && message && message.length > ERROR_LINE_MAX) console.error("[voice]", message);
  }, [phase, message]);

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
          <span aria-hidden="true" className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--c-hover)] ring-1 ring-inset ring-[var(--c-line)]">
            <span
              className="block h-full w-full origin-left rounded-full bg-[var(--c-bad)] transition-transform duration-75"
              style={{ transform: `scaleX(${fill})` }}
            />
          </span>
          <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-[var(--c-ink-2)]">{formatElapsed(now - startedAt)}</span>
        </>
      );
      break;
    case "transcribing":
      icon = <Loader2 {...ICON} className="animate-spin" />;
      label = engine === "browser" ? BROWSER_SPEECH_HINT : "Transcribing…";
      break;
    case "done":
      icon = <Check {...ICON} className="text-[var(--c-ok)]" />;
      label = "Got it";
      break;
    case "error":
      icon = <TriangleAlert {...ICON} />;
      tone = "text-[var(--c-bad)]";
      label = message && message.length <= ERROR_LINE_MAX ? message : "Transcription failed. Try again.";
      title = message ?? label;
      tail = (
        <button type="button" onClick={onRetry} className={actionBtn}>
          <RotateCcw {...ICON} aria-hidden="true" />
          Retry
        </button>
      );
      break;
    case "unavailable":
      icon = <MicOff {...ICON} />;
      // Denied and unsupported both land here; say which, and what the user can do about it.
      label = message && isUnsupported(message)
        ? "Mic not supported here. Type instead."
        : message && isDenied(message)
          ? "Mic blocked. Allow it in browser settings."
          : "Mic unavailable.";
      title = message ?? undefined;
      tail = (
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className={`${actionBtn} w-6 !px-0`}>
          <X {...ICON} />
        </button>
      );
      break;
    case "notice":
      icon = <MicOff {...ICON} />;
      label = message ?? "";
      title = label;
      break;
    default:
      return null;
  }

  return (
    <motion.div
      key={phase}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.15, ease: "easeOut" }}
      role={phase === "error" ? "alert" : "status"}
      aria-live="polite"
      title={title}
      data-testid="voice-bar"
      data-phase={phase}
      className={`flex h-8 min-w-0 items-center gap-2 rounded-full bg-[var(--c-tray)] pr-2 pl-3 text-[14px] leading-5 ${tone}`}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {tail}
    </motion.div>
  );
}
