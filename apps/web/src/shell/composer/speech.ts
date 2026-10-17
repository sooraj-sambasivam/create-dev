/** Browser SpeechRecognition fallback for when the server has no transcription key. */

export type VoiceEngine = "server" | "browser";

export const BROWSER_SPEECH_HINT = "Using browser speech recognition";

/** Minimal structural types; lib.dom does not ship SpeechRecognition. */
export interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
export interface SpeechEventLike {
  results: ArrayLike<SpeechResultLike>;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((e: SpeechEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type SpeechCtor = new () => SpeechRecognitionLike;

export function getSpeechCtor(win: unknown = typeof window === "undefined" ? undefined : window): SpeechCtor | null {
  const w = win as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor } | undefined;
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
}

/**
 * Which engine to use. `probeStatus` is the HTTP status of an empty probe to /api/transcribe
 * (503 = no key configured), or null if the probe failed. Only a 503 with browser support
 * switches engines; everything else keeps the server path (and its own error messages).
 */
export function chooseEngine(probeStatus: number | null, speechAvailable: boolean): VoiceEngine {
  return probeStatus === 503 && speechAvailable ? "browser" : "server";
}

/** Empty POST: 503 when ELEVENLABS_API_KEY is missing, 400 (no audio) when it is set. Spends nothing. */
export async function probeTranscribe(fetchImpl: typeof fetch = fetch): Promise<number | null> {
  try {
    const res = await fetchImpl("/api/transcribe", { method: "POST", body: new FormData() });
    return res.status;
  } catch {
    return null;
  }
}

/** Join recognition results into one string, and note whether every result is final. */
export function joinResults(results: ArrayLike<SpeechResultLike>): string {
  let out = "";
  for (let i = 0; i < results.length; i++) out += results[i][0].transcript;
  return out.replace(/\s+/g, " ").trim();
}

/** Map a SpeechRecognition error code to a voice event. */
export function speechErrorEvent(code: string): { type: "deny" | "fail"; message: string } {
  if (code === "not-allowed" || code === "service-not-allowed") return { type: "deny", message: "Microphone access was denied. Allow it in your browser, or type." };
  if (code === "no-speech") return { type: "fail", message: "I couldn't hear any words. Try again, or type." };
  if (code === "audio-capture") return { type: "fail", message: "No microphone found. Plug one in, or type." };
  return { type: "fail", message: "Speech recognition failed. Try again, or type." };
}

export interface SpeechHandlers {
  onStart: () => void;
  /** Running transcript (interim + final). */
  onText: (text: string) => void;
  onError: (code: string) => void;
  /** Recognition ended; `text` is the last transcript. */
  onEnd: (text: string) => void;
}

export interface SpeechSession {
  stop: () => void;
  abort: () => void;
}

export function startSpeech(Ctor: SpeechCtor, h: SpeechHandlers, lang = "en-US"): SpeechSession {
  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  let text = "";
  let ended = false;
  rec.onstart = () => h.onStart();
  rec.onresult = (e) => {
    text = joinResults(e.results);
    h.onText(text);
  };
  rec.onerror = (e) => {
    if (e.error !== "aborted") h.onError(e.error);
  };
  rec.onend = () => {
    if (ended) return;
    ended = true;
    h.onEnd(text);
  };
  try {
    rec.start();
  } catch {
    ended = true;
    h.onError("start-failed");
  }
  return {
    stop: () => rec.stop(),
    abort: () => {
      ended = true;
      rec.abort();
    },
  };
}
