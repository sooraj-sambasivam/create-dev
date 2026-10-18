import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createVoice,
  TranscribeUnavailableError,
  WORDS_GRACE_MS,
  type ScribeConnection,
  type ScribeEventData,
  type SpeechRecognitionLike,
  type SpeechResultEvent,
  type VoiceSyncSink,
} from "./voice";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Conn = ScribeConnection & { emit(ev: string, d?: ScribeEventData): void; startCb: ((ms: number) => void) | null };

/** A Scribe connection that delivers committed words like the live one (many listeners per event). */
function liveConn(): Conn {
  const h = new Map<string, Array<(d: ScribeEventData) => void>>();
  const c: Conn = {
    expectsTimestamps: true,
    startCb: null,
    on(ev, fn) {
      h.set(ev, [...(h.get(ev) ?? []), fn]);
    },
    onAudioStart(cb) {
      c.startCb = cb;
    },
    commit: vi.fn(),
    close: vi.fn(),
    emit(ev, d = {}) {
      for (const fn of h.get(ev) ?? []) fn(d);
    },
  };
  return c;
}

function setup(joinUntilRelease = false) {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ provider: "elevenlabs", token: "t", model: "scribe_v2_realtime", expiresInSec: 900 }))));
  const conn = liveConn();
  const out: Array<[string, boolean]> = [];
  const order: string[] = [];
  const sync: VoiceSyncSink = {
    scribe: (m) => order.push(`sync:${m.message_type}`),
    audioStart: (ms) => order.push(`start:${ms}`),
    speech: () => {},
  };
  const connectScribe = vi.fn(async () => conn);
  const voice = createVoice({
    onTranscript: (t, f) => {
      order.push(`out:${f ? "final" : "interim"}`);
      out.push([t, f]);
    },
    onState: () => {},
    sync,
    joinUntilRelease,
    deps: {
      hasMic: true,
      connectScribe,
      getUserMedia: vi.fn(async () => ({ getTracks: () => [] }) as unknown as MediaStream),
      createRecorder: () => ({ state: "inactive", mimeType: "audio/webm", ondataavailable: null, onstop: null, start() {}, stop() {} }),
    },
  });
  return { conn, out, order, voice, connectScribe };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(5);
}

describe("voice sync sink", () => {
  it("asks for word timestamps and VAD commits when a sync sink is given", async () => {
    const { voice, connectScribe } = setup();
    voice.start();
    await settle();
    expect(connectScribe.mock.calls[0]).toMatchObject([{ includeTimestamps: true, vadSilenceSecs: 0.5 }]);
    voice.destroy();
  });

  it("forwards Scribe messages and the audio start before the transcript text is delivered", async () => {
    const { voice, conn, out, order } = setup();
    voice.start();
    await settle();
    conn.startCb?.(1234);
    conn.emit("partial_transcript", { text: "move this" });
    conn.emit("committed_transcript", { text: "Move this here." });
    expect(out).toEqual([["move this", false]]); // the final waits for its words
    conn.emit("committed_transcript_with_timestamps", { text: "Move this here.", words: [{ text: "Move", start: 0, end: 0.2 }] });
    expect(out.at(-1)).toEqual(["Move this here.", true]);
    expect(order.indexOf("start:1234")).toBeLessThan(order.indexOf("sync:partial_transcript"));
    expect(order.indexOf("sync:committed_transcript_with_timestamps")).toBeLessThan(order.lastIndexOf("out:final"));
    voice.destroy();
  });

  it("delivers the final anyway when the timestamps never arrive", async () => {
    const { voice, conn, out } = setup();
    voice.start();
    await settle();
    conn.emit("committed_transcript", { text: "Delete that." });
    expect(out).toEqual([]);
    await vi.advanceTimersByTimeAsync(WORDS_GRACE_MS + 1);
    expect(out).toEqual([["Delete that.", true]]);
    voice.destroy();
  });

  it("closes the connection after release once the words have arrived", async () => {
    const { voice, conn, out } = setup();
    voice.start();
    await settle();
    voice.stop();
    expect(conn.commit).toHaveBeenCalledTimes(1);
    conn.emit("committed_transcript", { text: "Fix it." });
    expect(conn.close).not.toHaveBeenCalled();
    conn.emit("committed_transcript_with_timestamps", { text: "Fix it." });
    expect(out).toEqual([["Fix it.", true]]);
    expect(conn.close).toHaveBeenCalled();
  });

  it("hold-to-talk: lines committed on a pause are delivered together when the key is released", async () => {
    const { voice, conn, out } = setup(true);
    voice.start();
    await settle();
    conn.emit("committed_transcript", { text: "Move this" });
    conn.emit("committed_transcript_with_timestamps", { text: "Move this" });
    expect(out).toEqual([]); // still held down: not cut into a command yet
    voice.stop();
    conn.emit("committed_transcript", { text: "over here." });
    conn.emit("committed_transcript_with_timestamps", { text: "over here." });
    expect(out).toEqual([["Move this over here.", true]]);
    expect(conn.close).toHaveBeenCalled();
  });

  it("hold-to-talk: an empty release commit still delivers what was held", async () => {
    const { voice, conn, out } = setup(true);
    voice.start();
    await settle();
    conn.emit("committed_transcript", { text: "Fix it." });
    conn.emit("committed_transcript_with_timestamps", { text: "Fix it." });
    voice.stop();
    conn.emit("committed_transcript", { text: "" });
    expect(out).toEqual([["Fix it.", true]]);
  });

  it("hold-to-talk: held lines are delivered when the release commit never answers", async () => {
    const { voice, conn, out } = setup(true);
    voice.start();
    await settle();
    conn.emit("committed_transcript", { text: "Fix it." });
    conn.emit("committed_transcript_with_timestamps", { text: "Fix it." });
    voice.stop();
    await vi.advanceTimersByTimeAsync(4100);
    expect(out).toEqual([["Fix it.", true]]);
  });

  it("forwards browser speech results with a stable key per result", async () => {
    const flush = async () => {
      for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
    };
    class FakeSpeech {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((e: SpeechResultEvent) => void) | null = null;
      onerror: ((e: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {}
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    const speech: Array<[string, string, boolean]> = [];
    const made: FakeSpeech[] = [];
    const recorder = () => {
      const r = {
        state: "inactive",
        mimeType: "audio/webm",
        ondataavailable: null as ((e: { data: Blob }) => void) | null,
        onstop: null as (() => void) | null,
        start() {
          r.state = "recording";
        },
        stop() {
          r.state = "inactive";
          r.ondataavailable?.({ data: new Blob(["audio"]) });
          r.onstop?.();
        },
      };
      return r;
    };
    const voice = createVoice({
      onTranscript: () => {},
      onState: () => {},
      sync: { scribe: () => {}, audioStart: () => {}, speech: (k, t, f) => speech.push([k, t, f]) },
      deps: {
        hasMic: true,
        fetchToken: async () => ({ provider: "batch", reason: "x" }),
        getUserMedia: async () => ({ getTracks: () => [] }) as unknown as MediaStream,
        createRecorder: recorder as never,
        transcribe: async () => {
          throw new TranscribeUnavailableError();
        },
        createSpeechRecognition: () => {
          const s = new FakeSpeech();
          made.push(s);
          return s as unknown as SpeechRecognitionLike;
        },
      },
    });
    // The first segment finds the server cannot transcribe and switches to the browser engine for the next one.
    voice.start();
    await flush();
    voice.stop();
    await flush();
    voice.start();
    await flush();
    const live = made.at(-1)!;
    live.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "move this" } }] });
    live.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "move this here" } }] });
    expect(speech).toEqual([
      ["1:0", "move this", false],
      ["1:0", "move this here", true],
    ]);
    voice.destroy();
  });
});
