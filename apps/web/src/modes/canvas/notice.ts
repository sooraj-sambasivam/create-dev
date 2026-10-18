/**
 * Tone for a narration notice. The voice layer reports its server-to-browser speech fallback through the
 * same error callback as real failures, so the canvas classifies it here: the fallback is informational.
 */
export type NoticeTone = "error" | "info";

const FALLBACK_NOTICE = /^Server transcription is unavailable; using browser speech recognition\b/;

export function classifyNarrateNotice(message: string): NoticeTone {
  return FALLBACK_NOTICE.test(message.trim()) ? "info" : "error";
}
