import { createClock, type SyncClock } from "../sync/clock";
import type { ScribeConnection, ScribeConnectOptions, ScribeEventData } from "./voice";

/**
 * Scribe realtime over a plain WebSocket plus an AudioWorklet, so the audio clock is known exactly:
 * the first sample sent is stamped on the performance.now timeline (sample counting, not wall time), which
 * turns the server's word offsets (seconds from that first sample) into word times for the sync core.
 *
 * The server commits on silence (commit_strategy=vad), so a final transcript lands ~0.5 s after the speech
 * stops instead of waiting for a manual commit. A manual commit on release still works.
 */

export const SCRIBE_WS = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
/** Silence the server waits for before it commits a segment. */
export const VAD_SILENCE_SECS = 0.5;
const SAMPLE_RATE = 16_000;
const BLOCKS_PER_MESSAGE = 8; // 8 x 128 frames = 64 ms
/** Capture latency larger than this is not believed (Chrome reports 0 when unknown). */
const MAX_INPUT_LATENCY_MS = 250;

export function scribeUrl(o: { token: string; modelId: string; vadSilenceSecs?: number; includeTimestamps?: boolean }): string {
  const p = new URLSearchParams({
    model_id: o.modelId,
    audio_format: `pcm_${SAMPLE_RATE}`,
    commit_strategy: o.vadSilenceSecs ? "vad" : "manual",
    include_timestamps: o.includeTimestamps === false ? "false" : "true",
    token: o.token,
  });
  if (o.vadSilenceSecs) p.set("vad_silence_threshold_secs", String(o.vadSilenceSecs));
  return `${SCRIBE_WS}?${p.toString()}`;
}

const WORKLET = `
class ScribeCap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.n = 0; this.f0 = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.n === 0) this.f0 = currentFrame;
    this.buf.push(new Float32Array(ch)); this.n++;
    if (this.n >= ${BLOCKS_PER_MESSAGE}) {
      const out = new Float32Array(this.n * 128);
      this.buf.forEach((b, i) => out.set(b, i * 128));
      this.port.postMessage({ frame: this.f0, pcm: out }, [out.buffer]);
      this.buf = []; this.n = 0;
    }
    return true;
  }
}
registerProcessor('scribe-cap', ScribeCap);`;

function toBase64(i16: Int16Array): string {
  const u8 = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

export type ScribeLiveDeps = {
  clock?: SyncClock;
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
};

export type ScribeLiveConnection = ScribeConnection & {
  readonly expectsTimestamps: true;
  /** performance.now of the first sample sent, or null until the first audio block arrives. */
  readonly audioStartMs: number | null;
};

/**
 * Connects, starts the mic and streams. Resolves once the socket is open and the mic is flowing. Audio captured
 * while the socket was still opening is sent first, so speech right after keydown is not lost.
 */
export async function connectScribeLive(opts: ScribeConnectOptions, deps: ScribeLiveDeps = {}): Promise<ScribeLiveConnection> {
  const clock = deps.clock ?? createClock();
  const getUserMedia = deps.getUserMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c));
  const listeners = new Map<string, Array<(d: ScribeEventData) => void>>();
  const emit = (ev: string, d: ScribeEventData) => {
    for (const fn of listeners.get(ev) ?? []) fn(d);
  };

  let closed = false;
  let audioStart: number | null = null;
  const startCbs: Array<(ms: number) => void> = [];
  const queue: string[] = [];

  const ws = new WebSocket(
    scribeUrl({ token: opts.token, modelId: opts.modelId, vadSilenceSecs: opts.vadSilenceSecs, includeTimestamps: opts.includeTimestamps }),
  );
  const opened = new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("Scribe socket error"));
  });
  opened.catch(() => {}); // surfaced by the await below; no unhandled rejection if the mic fails first
  ws.onmessage = (e) => {
    let m: (ScribeEventData & { message_type?: string }) | null = null;
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (m?.message_type) emit(m.message_type, m);
  };
  ws.onclose = () => {
    if (!closed) emit("error", { error: "connection closed" });
  };

  const send = (b64: string, commit: boolean) => {
    ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: b64, sample_rate: SAMPLE_RATE, commit }));
  };

  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  const teardown = () => {
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* already stopped */
    }
    void ctx?.close().catch(() => {});
  };

  try {
    stream = await getUserMedia({ audio: { ...opts.microphone, channelCount: 1 } });
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "scribe-cap");
    const sink = ctx.createGain();
    sink.gain.value = 0;
    src.connect(node);
    node.connect(sink);
    sink.connect(ctx.destination);
    const latency = Number((stream.getAudioTracks()[0]?.getSettings() as { latency?: number } | undefined)?.latency);
    const inputLatencyMs = Number.isFinite(latency) ? Math.min(MAX_INPUT_LATENCY_MS, Math.max(0, latency * 1000)) : 0;
    const audioCtx = ctx;
    node.port.onmessage = (e: MessageEvent<{ frame: number; pcm: Float32Array }>) => {
      if (closed) return;
      const { frame, pcm } = e.data;
      if (audioStart === null) {
        // Sample 0 of the stream: the context time of the first block, mapped to the page clock.
        audioStart = Math.min(clock.now(), clock.fromAudioContextTime(audioCtx, frame / audioCtx.sampleRate)) - inputLatencyMs;
        for (const cb of startCbs) cb(audioStart);
      }
      const i16 = new Int16Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) i16[i] = Math.max(-1, Math.min(1, pcm[i])) * 32767;
      const b64 = toBase64(i16);
      if (ws.readyState === WebSocket.OPEN && queue.length === 0) send(b64, false);
      else queue.push(b64);
    };
    await ctx.resume();
    await opened;
  } catch (err) {
    closed = true;
    teardown();
    try {
      ws.close();
    } catch {
      /* not open */
    }
    throw err;
  }
  for (const b64 of queue.splice(0)) send(b64, false);

  return {
    expectsTimestamps: true,
    get audioStartMs() {
      return audioStart;
    },
    onAudioStart(cb) {
      if (audioStart !== null) cb(audioStart);
      else startCbs.push(cb);
    },
    on(event, listener) {
      const l = listeners.get(event) ?? [];
      l.push(listener);
      listeners.set(event, l);
    },
    commit() {
      if (ws.readyState === WebSocket.OPEN) send("", true);
    },
    close() {
      if (closed) return;
      closed = true;
      teardown();
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
  };
}
