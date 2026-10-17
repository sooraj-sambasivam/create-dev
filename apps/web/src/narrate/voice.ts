import type { VoiceTokenResult } from "@create/shared";
import { HOLD_KEY, initialKeyState, reduceKey, type KeyEvent, type KeyState } from "./keys";

/**
 * Voice input for narration. Prefers ElevenLabs realtime Scribe (token from GET /api/voice-token);
 * when the server says "batch" (no key, quota, network error) it records each push-to-talk
 * segment with MediaRecorder and sends the blob to POST /api/transcribe on release.
 */

export type VoiceState = "unavailable" | "idle" | "listening" | "locked";

/** How long a realtime segment waits for its final committed transcript after release. */
export const DRAIN_TIMEOUT_MS = 4_000;

/** Realtime errors after which the controller stops using the realtime path for good. */
const FATAL_REALTIME_EVENTS = [
  "auth_error",
  "error",
  "quota_exceeded",
  "transcriber_error",
  "unaccepted_terms",
  "rate_limited",
  "invalid_request",
  "queue_overflow",
  "resource_exhausted",
  "session_time_limit_exceeded",
  "chunk_size_exceeded",
  "input_error",
] as const;

export type VoiceOptions = {
  /** Called for every result: interim (final=false) and final (final=true) text. */
  onTranscript: (text: string, final: boolean) => void;
  /** Called on every mode change, and once with "unavailable" when there is no microphone or it is denied. */
  onState: (state: VoiceState) => void;
  /** Called with a human-readable message when a realtime or batch step fails. Optional. */
  onError?: (message: string) => void;
  /** Called when the controller switches to the browser's SpeechRecognition (server transcription unavailable). */
  onEngine?: (engine: "browser") => void;
  /** Injected collaborators; defaults use the browser, fetch and the API client. Mainly for tests. */
  deps?: VoiceDeps;
};

export type VoiceDeps = {
  fetchToken?: () => Promise<VoiceTokenResult>;
  connectScribe?: (opts: ScribeConnectOptions) => Promise<ScribeConnection>;
  transcribe?: (audio: Blob) => Promise<string>;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createRecorder?: (stream: MediaStream) => RecorderLike;
  /** Whether a microphone can be requested at all. Defaults to navigator.mediaDevices.getUserMedia presence. */
  hasMic?: boolean;
  /** Creates a browser SpeechRecognition, or null when the browser has none. Defaults to (webkit)SpeechRecognition. */
  createSpeechRecognition?: () => SpeechRecognitionLike | null;
};

/** Thrown by the default batch transcriber when /api/transcribe answers 503 (no ELEVENLABS_API_KEY). */
export class TranscribeUnavailableError extends Error {
  readonly status = 503;
  constructor(message = "Transcription is not configured on the server") {
    super(message);
    this.name = "TranscribeUnavailableError";
  }
}

/** The subset of the browser SpeechRecognition API this module uses. */
export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

export type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript: string } }>;
};

export type VoiceController = {
  readonly available: boolean;
  /** Hold-to-talk: begin listening. No-op when locked, denied or destroyed. */
  start(): void;
  /** End listening. The last segment still delivers its final transcript. */
  stop(): void;
  /** Latch listening on until the next single tap (stop()). */
  lock(): void;
  /** Abort everything (no further transcripts) and ignore further calls. */
  destroy(): void;
  /** Wires Option (Alt) push-to-talk to this controller. Defaults to window; returns an unbinder. */
  bindKeys(target?: KeyTarget | null): () => void;
};

export type ScribeEventData = { text?: string; error?: string };

/** The subset of a Scribe RealtimeConnection this module uses. Events are the RealtimeEvents string values. */
export type ScribeConnection = {
  on(event: string, listener: (data: ScribeEventData) => void): void;
  commit(): void;
  close(): void;
};

export type ScribeConnectOptions = {
  token: string;
  modelId: "scribe_v2_realtime";
  microphone: { echoCancellation: boolean; noiseSuppression: boolean };
};

export type RecorderLike = {
  readonly state: string;
  readonly mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(): void;
  stop(): void;
};

type KeyTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** A push-to-talk capture. `ended` flips once; onEnd/abort are set by the realtime or batch path. */
type Segment = {
  ended: boolean;
  finished: boolean;
  /** Mic capture started at keydown, so a quick press-and-release (or a slow realtime connect) loses nothing. */
  capture?: Promise<Capture | null>;
  onEnd?: () => void;
  abort?: () => void;
};

type Capture = {
  /** Stops recording and resolves the audio (null when empty or discarded). */
  stop(): Promise<Blob | null>;
  /** Stops recording and drops the audio. */
  discard(): void;
};

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true },
};

function defaultHasMic(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

/**
 * GET /api/voice-token. Never throws: any failure (HTTP error, bad body, network) becomes
 * `{ provider: "batch", reason }`, so callers always have a path to use.
 */
export async function fetchVoiceToken(fetchImpl?: typeof fetch): Promise<VoiceTokenResult> {
  const doFetch = fetchImpl ?? (typeof fetch === "function" ? globalThis.fetch : undefined);
  if (!doFetch) return { provider: "batch", reason: "no-fetch" };
  try {
    const res = await doFetch("/api/voice-token", { cache: "no-store" });
    if (!res.ok) return { provider: "batch", reason: `http-${res.status}` };
    const data = (await res.json()) as Record<string, unknown>;
    if (data.provider === "elevenlabs") {
      if (
        typeof data.token === "string" &&
        data.token.length > 0 &&
        data.model === "scribe_v2_realtime" &&
        typeof data.expiresInSec === "number"
      ) {
        return { provider: "elevenlabs", token: data.token, model: "scribe_v2_realtime", expiresInSec: data.expiresInSec };
      }
      return { provider: "batch", reason: "bad-response" };
    }
    if (data.provider === "batch") {
      return { provider: "batch", reason: typeof data.reason === "string" ? data.reason : "server-fallback" };
    }
    return { provider: "batch", reason: "bad-response" };
  } catch (err) {
    return { provider: "batch", reason: err instanceof Error ? err.message : "fetch-failed" };
  }
}

/** The realtime path for one segment: connects, streams, and commits on release. */
async function defaultConnectScribe(opts: ScribeConnectOptions): Promise<ScribeConnection> {
  // Scribe lives in @elevenlabs/client, re-exported by @elevenlabs/react (a web dependency).
  const mod = await import("@elevenlabs/react");
  const conn = mod.Scribe.connect({
    token: opts.token,
    modelId: opts.modelId,
    commitStrategy: mod.CommitStrategy.MANUAL,
    microphone: opts.microphone,
  });
  return conn as unknown as ScribeConnection;
}

function defaultGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(constraints);
}

function defaultCreateRecorder(stream: MediaStream): RecorderLike {
  return new MediaRecorder(stream) as unknown as RecorderLike;
}

/** Default batch transcriber: POST /api/transcribe; a 503 (mock mode, no key) becomes TranscribeUnavailableError. */
async function defaultTranscribe(audio: Blob): Promise<string> {
  const form = new FormData();
  const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm";
  form.append("audio", audio, `recording.${ext}`);
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  if (res.status === 503) throw new TranscribeUnavailableError();
  if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
  const data = (await res.json()) as { text?: unknown };
  return typeof data.text === "string" ? data.text : "";
}

function defaultCreateSpeechRecognition(): SpeechRecognitionLike | null {
  const w = globalThis as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

function inertController(bind: (target?: KeyTarget | null) => () => void): VoiceController {
  return {
    available: false,
    start() {},
    stop() {},
    lock() {},
    destroy() {},
    bindKeys: bind,
  };
}

export function createVoice(opts: VoiceOptions): VoiceController {
  const deps = opts.deps ?? {};
  const hasMic = deps.hasMic ?? defaultHasMic();
  if (!hasMic) {
    opts.onState("unavailable");
    const inert = inertController((target) => bindKeys(inert, target));
    return inert;
  }

  const fetchToken = deps.fetchToken ?? (() => fetchVoiceToken());
  const connectScribe = deps.connectScribe ?? defaultConnectScribe;
  const transcribe = deps.transcribe ?? defaultTranscribe;
  const getUserMedia = deps.getUserMedia ?? defaultGetUserMedia;
  const createRecorder = deps.createRecorder ?? defaultCreateRecorder;
  const createSpeech = deps.createSpeechRecognition ?? defaultCreateSpeechRecognition;

  let mode: VoiceState = "idle";
  let denied = false;
  let destroyed = false;
  let realtimeDisabled = false;
  /** Set once the server cannot transcribe (503): later segments use the browser's SpeechRecognition. */
  let browserSpeech = false;
  let current: Segment | null = null;

  const setMode = (m: VoiceState) => {
    if (m === mode) return;
    mode = m;
    opts.onState(m);
  };

  const reportError = (message: string) => opts.onError?.(message);

  const emit = (text: string | undefined, final: boolean) => {
    if (!text || !text.trim()) return;
    opts.onTranscript(final ? text.trim() : text, final);
  };

  const markUnavailable = () => {
    denied = true;
    mode = "idle";
    opts.onState("unavailable");
  };

  const finishSegment = (seg: Segment) => {
    seg.finished = true;
    if (current === seg) current = null;
  };

  const endSegment = (seg: Segment) => {
    if (seg.ended) return;
    seg.ended = true;
    seg.onEnd?.();
  };

  /** Opens the mic and records right away. Resolves null when the mic or recorder is unavailable. */
  const startCapture = async (): Promise<Capture | null> => {
    let stream: MediaStream;
    try {
      stream = await getUserMedia(MIC_CONSTRAINTS);
    } catch {
      return null;
    }
    if (destroyed) {
      stopTracks(stream);
      return null;
    }
    let recorder: RecorderLike;
    try {
      recorder = createRecorder(stream);
    } catch {
      stopTracks(stream);
      return null;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    try {
      recorder.start();
    } catch {
      stopTracks(stream);
      return null;
    }
    let discarded = false;
    let stopped: Promise<Blob | null> | undefined;
    return {
      stop() {
        stopped ??= new Promise<Blob | null>((resolve) => {
          const settle = () => {
            stopTracks(stream);
            if (discarded || chunks.length === 0) return resolve(null);
            const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
            resolve(blob.size > 0 ? blob : null);
          };
          if (recorder.state === "inactive") return settle();
          recorder.onstop = settle;
          recorder.stop();
        });
        return stopped;
      },
      discard() {
        discarded = true;
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== "inactive") recorder.stop();
        stopTracks(stream);
      },
    };
  };

  /** Realtime Scribe for one segment. Falls back to batch for this segment on a fatal error. */
  const startRealtime = async (seg: Segment, token: string) => {
    let conn: ScribeConnection;
    try {
      conn = await connectScribe({
        token,
        modelId: "scribe_v2_realtime",
        microphone: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      realtimeDisabled = true;
      reportError(`Realtime voice failed: ${err instanceof Error ? err.message : "connect error"}`);
      await startBatch(seg);
      return;
    }

    let closed = false;
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    const closeConn = () => {
      if (closed) return;
      closed = true;
      clearTimeout(drainTimer);
      try {
        conn.close();
      } catch {
        /* already closed */
      }
    };
    const done = () => {
      closeConn();
      finishSegment(seg);
    };

    if (destroyed) {
      closeConn();
      finishSegment(seg);
      return;
    }
    if (seg.ended) {
      // Released while connecting: the realtime stream missed the speech, so transcribe the buffered recording.
      closeConn();
      await startBatch(seg);
      return;
    }
    // Realtime is live and captures the mic itself; the keydown buffer is no longer needed.
    void seg.capture?.then((c) => c?.discard());

    seg.abort = done;
    seg.onEnd = () => {
      // Commit flushes the captured audio; the committed transcript closes the socket.
      try {
        conn.commit();
      } catch {
        done();
        return;
      }
      drainTimer = setTimeout(done, DRAIN_TIMEOUT_MS);
    };

    conn.on("partial_transcript", (d) => {
      if (!seg.finished && !destroyed) emit(d.text, false);
    });
    conn.on("committed_transcript", (d) => {
      if (!seg.ended) {
        // Committed mid-listen: deliver it but keep listening.
        if (!destroyed) emit(d.text, true);
        return;
      }
      if (!destroyed) emit(d.text, true);
      done();
    });
    conn.on("insufficient_audio_activity", () => {
      // A release with no speech: nothing to transcribe.
      if (seg.ended) done();
    });
    for (const ev of FATAL_REALTIME_EVENTS) {
      conn.on(ev, (d) => {
        const message = d?.error ? `${ev}: ${d.error}` : ev;
        if (seg.ended || destroyed) {
          reportError(`Voice error: ${message}`);
          done();
          return;
        }
        // Mid-listen failure: keep the segment alive on the batch path so speech is not lost.
        realtimeDisabled = true;
        reportError(`Realtime voice failed (${message}); using batch transcription`);
        closeConn();
        seg.capture = startCapture();
        void startBatch(seg);
      });
    }
  };

  /** Switches later segments to the browser's SpeechRecognition. Returns false when the browser has none. */
  const enableBrowserSpeech = (): boolean => {
    if (browserSpeech) return true;
    const probe = createSpeech();
    if (!probe) return false;
    try {
      probe.abort();
    } catch {
      /* never started */
    }
    browserSpeech = true;
    opts.onEngine?.("browser");
    return true;
  };

  /** Uses the recording buffered since keydown; the blob is transcribed when the segment ends. */
  const startBatch = async (seg: Segment) => {
    const cap = await (seg.capture ?? Promise.resolve(null));
    if (destroyed) {
      cap?.discard();
      finishSegment(seg);
      return;
    }
    if (!cap) {
      markUnavailable();
      finishSegment(seg);
      return;
    }
    seg.abort = () => {
      cap.discard();
      finishSegment(seg);
    };
    let ran = false;
    const run = async () => {
      if (ran) return;
      ran = true;
      try {
        const blob = await cap.stop();
        if (destroyed || !blob) return;
        const text = await transcribe(blob);
        // destroy() may have run while the upload was in flight.
        if (destroyed) return;
        emit(text, true);
      } catch (err) {
        if (destroyed) return;
        if (err instanceof TranscribeUnavailableError || (err as { status?: number } | null)?.status === 503) {
          if (enableBrowserSpeech()) {
            reportError("Server transcription is unavailable; using browser speech recognition for the next segments");
          } else {
            reportError("Transcription is unavailable and this browser has no speech recognition");
            markUnavailable();
          }
          return;
        }
        reportError(`Transcription failed: ${err instanceof Error ? err.message : "unknown error"}`);
      } finally {
        finishSegment(seg);
      }
    };
    seg.onEnd = () => void run();
    if (seg.ended) void run();
  };

  /** Browser SpeechRecognition for one segment (used once the server cannot transcribe). */
  const startSpeech = (seg: Segment) => {
    const rec = createSpeech();
    if (!rec) {
      markUnavailable();
      finishSegment(seg);
      return;
    }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
    rec.onresult = (e) => {
      if (destroyed) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        emit(r?.[0]?.transcript, !!r?.isFinal);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      reportError(`Browser speech recognition: ${e.error ?? "error"}`);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") markUnavailable();
    };
    rec.onend = () => {
      // Chrome ends a continuous session after silence; keep going until the segment is released.
      if (!seg.ended && !destroyed && !denied) {
        try {
          rec.start();
          return;
        } catch {
          /* fall through and finish */
        }
      }
      finishSegment(seg);
    };
    seg.onEnd = () => {
      try {
        rec.stop();
      } catch {
        finishSegment(seg);
      }
    };
    seg.abort = () => {
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      try {
        rec.abort();
      } catch {
        /* not running */
      }
      finishSegment(seg);
    };
    try {
      rec.start();
    } catch {
      markUnavailable();
      finishSegment(seg);
    }
  };

  /** Decides the path for a new segment: realtime when the server issued a token, else batch. */
  const runSegment = async (seg: Segment) => {
    const token = await fetchToken();
    if (destroyed) {
      finishSegment(seg);
      return;
    }
    // A segment released before the connection could open is transcribed from its keydown buffer.
    if (token.provider === "elevenlabs" && !realtimeDisabled && !seg.ended) {
      await startRealtime(seg, token.token);
    } else {
      await startBatch(seg);
    }
  };

  const ensureSegment = () => {
    if (current && !current.ended) return;
    const seg: Segment = { ended: false, finished: false };
    current = seg;
    if (browserSpeech) {
      startSpeech(seg);
      return;
    }
    // Record from keydown; the realtime path discards this once its connection is live.
    const capture = startCapture();
    seg.capture = capture;
    seg.abort = () => {
      void capture.then((c) => c?.discard());
      finishSegment(seg);
    };
    void runSegment(seg);
  };

  const endCurrent = () => {
    const seg = current;
    if (seg) endSegment(seg);
  };

  const controller: VoiceController = {
    available: true,
    bindKeys: (target) => bindKeys(controller, target),
    start() {
      if (destroyed || denied || mode === "locked") return;
      setMode("listening");
      ensureSegment();
    },
    stop() {
      if (destroyed) return;
      setMode("idle");
      endCurrent();
    },
    lock() {
      if (destroyed || denied) return;
      setMode("locked");
      ensureSegment();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      mode = "idle";
      const seg = current;
      current = null;
      seg?.abort?.();
    },
  };
  return controller;
}

/**
 * Wires the Option (Alt) push-to-talk state machine (keys.ts) to a voice controller.
 * Defaults to window; returns an unbinder. Returns a no-op when there is no target (SSR).
 */
export function bindKeys(
  voice: Pick<VoiceController, "start" | "stop" | "lock">,
  target: KeyTarget | null | undefined = typeof window !== "undefined" ? window : null,
): () => void {
  if (!target) return () => {};

  let state: KeyState = initialKeyState;
  const run = (ev: KeyEvent) => {
    const res = reduceKey(state, ev);
    state = res.state;
    switch (res.action) {
      case "start":
        voice.start();
        break;
      case "stop":
      case "unlock":
        voice.stop();
        break;
      case "lock":
        voice.lock();
        break;
      case "none":
        break;
    }
  };

  const onDown = (e: Event) => {
    const k = e as KeyboardEvent;
    if (k.key !== HOLD_KEY) return;
    run({ type: "down", repeat: k.repeat, at: Date.now() });
  };
  const onUp = (e: Event) => {
    const k = e as KeyboardEvent;
    if (k.key !== HOLD_KEY) return;
    run({ type: "up", at: Date.now() });
  };
  // Losing focus can swallow the keyup; reset rather than leave the mic open.
  const onBlur = () => {
    if (!state.listening) return;
    state = { ...initialKeyState };
    voice.stop();
  };

  target.addEventListener("keydown", onDown);
  target.addEventListener("keyup", onUp);
  target.addEventListener("blur", onBlur);
  return () => {
    target.removeEventListener("keydown", onDown);
    target.removeEventListener("keyup", onUp);
    target.removeEventListener("blur", onBlur);
  };
}
