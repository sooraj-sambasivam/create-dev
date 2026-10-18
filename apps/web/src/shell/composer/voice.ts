/** Pure state machine for the voice bar (no React, unit-testable). */

export type VoicePhase = "idle" | "requesting" | "listening" | "transcribing" | "done" | "error" | "unavailable" | "notice";

export interface VoiceState {
  phase: VoicePhase;
  /** One-line message for the error / unavailable / notice phases. */
  message: string | null;
  /** Set once the mic can't be used (unsupported or denied); keeps the fan's Mic disabled after dismissal. */
  blocked: string | null;
}

export type VoiceEvent =
  | { type: "start" }
  | { type: "granted" }
  | { type: "stop" }
  | { type: "transcribed" }
  | { type: "fail"; message: string }
  | { type: "deny"; message: string }
  | { type: "notice"; message: string }
  | { type: "dismiss" };

export const DONE_MS = 900;
/** How long the voice bar shows a notice (e.g. Mic clicked in a browser that can't record). */
export const NOTICE_MS = 3000;
export const MIC_UNSUPPORTED_NOTICE = "This browser can't use the microphone — type instead";

export function initialVoiceState(unsupportedReason: string | null = null): VoiceState {
  return { phase: "idle", message: null, blocked: unsupportedReason };
}

/** True when the bar replaces the control row (any phase but idle). */
export const voiceActive = (s: VoiceState): boolean => s.phase !== "idle";

export function voiceReducer(s: VoiceState, e: VoiceEvent): VoiceState {
  switch (e.type) {
    case "start":
      if (s.blocked || !(s.phase === "idle" || s.phase === "error" || s.phase === "done")) return s;
      return { ...s, phase: "requesting", message: null };
    case "granted":
      return s.phase === "requesting" ? { ...s, phase: "listening" } : s;
    case "stop":
      return s.phase === "listening" ? { ...s, phase: "transcribing" } : s;
    case "transcribed":
      return s.phase === "transcribing" ? { ...s, phase: "done", message: null } : s;
    case "fail":
      return s.phase === "requesting" || s.phase === "listening" || s.phase === "transcribing"
        ? { ...s, phase: "error", message: e.message }
        : s;
    case "deny":
      return s.phase === "requesting" ? { phase: "unavailable", message: e.message, blocked: e.message } : s;
    case "notice":
      // Shown from idle (or re-shown while already showing), so a repeat click restarts the timer.
      return s.phase === "idle" || s.phase === "notice" ? { ...s, phase: "notice", message: e.message } : s;
    case "dismiss":
      return s.phase === "done" || s.phase === "error" || s.phase === "unavailable" || s.phase === "notice"
        ? { ...s, phase: "idle", message: null }
        : s;
  }
}

/** Why the browser can't record at all, or null. */
export function unsupportedReason(env: { MediaRecorder?: unknown; mediaDevices?: { getUserMedia?: unknown } | null }): string | null {
  return env.MediaRecorder && env.mediaDevices?.getUserMedia ? null : "This browser can't record audio. Try Chrome, or type instead.";
}

/** useRecorder reports denial only through its error text. */
export const isDenied = (message: string): boolean => /denied|not allowed|permission/i.test(message);
export const isUnsupported = (message: string): boolean => /can't record/i.test(message);

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
