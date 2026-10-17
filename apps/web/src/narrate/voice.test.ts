import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoiceTokenResult } from "@create/shared";
import {
  bindKeys,
  createVoice,
  fetchVoiceToken,
  type RecorderLike,
  type SpeechRecognitionLike,
  type SpeechResultEvent,
  TranscribeUnavailableError,
  type ScribeConnection,
  type ScribeConnectOptions,
  type VoiceDeps,
  type VoiceState,
} from "./voice";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Lets pending promise chains (token fetch, getUserMedia, transcribe) settle. */
async function flush() {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
}

type FakeConn = ScribeConnection & { emit(event: string, data?: { text?: string; error?: string }): void };

function fakeConn(): FakeConn {
  const handlers = new Map<string, (d: { text?: string; error?: string }) => void>();
  return {
    on: vi.fn((event: string, fn: (d: { text?: string; error?: string }) => void) => {
      handlers.set(event, fn);
    }),
    commit: vi.fn(),
    close: vi.fn(),
    emit(event, data = {}) {
      handlers.get(event)?.(data);
    },
  };
}

class FakeRecorder implements RecorderLike {
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio-bytes"]) });
    this.onstop?.();
  }
}

function fakeStream() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  return { stream, stop };
}

const elevenToken: VoiceTokenResult = {
  provider: "elevenlabs",
  token: "sutkn_1",
  model: "scribe_v2_realtime",
  expiresInSec: 900,
};

function stubTokenResponse(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe("createVoice without a microphone", () => {
  it("reports unavailable and stays inert", () => {
    const states: VoiceState[] = [];
    const voice = createVoice({
      onTranscript: () => {},
      onState: (s) => states.push(s),
      deps: { hasMic: false },
    });
    expect(voice.available).toBe(false);
    expect(states).toEqual(["unavailable"]);
    expect(() => {
      voice.start();
      voice.lock();
      voice.stop();
      voice.destroy();
    }).not.toThrow();
  });
});

describe("fetchVoiceToken", () => {
  it("returns a valid ElevenLabs token", async () => {
    stubTokenResponse({ provider: "elevenlabs", token: "sutkn_1", model: "scribe_v2_realtime", expiresInSec: 900 });
    expect(await fetchVoiceToken()).toEqual(elevenToken);
  });

  it("passes the server's batch decision and reason through", async () => {
    stubTokenResponse({ provider: "batch", reason: "no-key" });
    expect(await fetchVoiceToken()).toEqual({ provider: "batch", reason: "no-key" });
  });

  it("falls back to batch with the HTTP status on errors", async () => {
    stubTokenResponse({ error: "boom" }, 500);
    expect(await fetchVoiceToken()).toEqual({ provider: "batch", reason: "http-500" });
  });

  it("falls back to batch with the error message on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await fetchVoiceToken()).toEqual({ provider: "batch", reason: "offline" });
  });

  it("treats a malformed ElevenLabs body as batch", async () => {
    stubTokenResponse({ provider: "elevenlabs", model: "scribe_v2_realtime", expiresInSec: 900 });
    expect(await fetchVoiceToken()).toEqual({ provider: "batch", reason: "bad-response" });
  });

  it("uses the injected fetch when given one", async () => {
    const fake = vi.fn(async () => new Response(JSON.stringify({ provider: "batch", reason: "x" })));
    await fetchVoiceToken(fake as unknown as typeof fetch);
    expect(fake).toHaveBeenCalledWith("/api/voice-token", expect.objectContaining({ cache: "no-store" }));
  });
});

describe("token fallback decision", () => {
  it("uses realtime Scribe when /api/voice-token issues an ElevenLabs token", async () => {
    stubTokenResponse({ provider: "elevenlabs", token: "sutkn_1", model: "scribe_v2_realtime", expiresInSec: 900 });
    const conn = fakeConn();
    const connectScribe = vi.fn(async (_opts: ScribeConnectOptions) => conn);
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    const transcribe = vi.fn(async () => "unused");
    const voice = createVoice({
      onTranscript: () => {},
      onState: () => {},
      deps: { hasMic: true, connectScribe, getUserMedia, transcribe },
    });

    voice.start();
    await flush();

    expect(connectScribe).toHaveBeenCalledTimes(1);
    expect(connectScribe.mock.calls[0][0]).toMatchObject({ token: "sutkn_1", modelId: "scribe_v2_realtime" });
    voice.destroy();
  });

  it("uses batch recording when the server answers batch", async () => {
    stubTokenResponse({ provider: "batch", reason: "no-key" });
    const connectScribe = vi.fn(async () => fakeConn());
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    const voice = createVoice({
      onTranscript: () => {},
      onState: () => {},
      deps: { hasMic: true, connectScribe, getUserMedia, createRecorder: () => new FakeRecorder() },
    });

    voice.start();
    await flush();

    expect(connectScribe).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    voice.destroy();
  });

  it("uses batch recording when the token request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const connectScribe = vi.fn(async () => fakeConn());
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    const voice = createVoice({
      onTranscript: () => {},
      onState: () => {},
      deps: { hasMic: true, connectScribe, getUserMedia, createRecorder: () => new FakeRecorder() },
    });

    voice.start();
    await flush();

    expect(connectScribe).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    voice.destroy();
  });
});

describe("realtime path", () => {
  it("streams partials and delivers the committed transcript on release", async () => {
    const conn = fakeConn();
    const transcripts: Array<[string, boolean]> = [];
    const voice = createVoice({
      onTranscript: (t, f) => transcripts.push([t, f]),
      onState: () => {},
      deps: {
        fetchToken: async () => elevenToken,
        connectScribe: async () => conn,
        hasMic: true,
      },
    });

    voice.start();
    await flush();
    conn.emit("partial_transcript", { text: "make th" });
    expect(transcripts).toEqual([["make th", false]]);

    voice.stop();
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.close).not.toHaveBeenCalled();

    conn.emit("committed_transcript", { text: " make this blue " });
    expect(transcripts.at(-1)).toEqual(["make this blue", true]);
    expect(conn.close).toHaveBeenCalled();
  });

  it("transcribes the keydown recording when released before the realtime connection is ready", async () => {
    const conn = fakeConn();
    let ready: () => void = () => {};
    const connectScribe = vi.fn(() => new Promise<ScribeConnection>((r) => (ready = () => r(conn))));
    const transcribe = vi.fn(async (_b: Blob) => "short phrase");
    const transcripts: Array<[string, boolean]> = [];
    const voice = createVoice({
      onTranscript: (t, f) => transcripts.push([t, f]),
      onState: () => {},
      deps: {
        fetchToken: async () => elevenToken,
        connectScribe,
        getUserMedia: async () => fakeStream().stream,
        createRecorder: () => new FakeRecorder(),
        transcribe,
        hasMic: true,
      },
    });

    voice.start();
    await flush();
    voice.stop(); // released while still connecting
    ready();
    await flush();
    expect(conn.close).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcripts).toEqual([["short phrase", true]]);
  });

  it("falls back to batch for the rest of the segment on a fatal error", async () => {
    const conn = fakeConn();
    const connectScribe = vi.fn(async () => conn);
    const transcribe = vi.fn(async () => "hello there");
    const onError = vi.fn();
    const transcripts: Array<[string, boolean]> = [];
    const voice = createVoice({
      onTranscript: (t, f) => transcripts.push([t, f]),
      onState: () => {},
      onError,
      deps: {
        fetchToken: async () => elevenToken,
        connectScribe,
        getUserMedia: async () => fakeStream().stream,
        createRecorder: () => new FakeRecorder(),
        transcribe,
        hasMic: true,
      },
    });

    voice.start();
    await flush();
    conn.emit("auth_error", { error: "bad token" });
    await flush();
    expect(conn.close).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("auth_error"));

    voice.stop();
    await flush();
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcripts).toEqual([["hello there", true]]);

    // Later segments skip realtime once it has failed.
    voice.start();
    await flush();
    expect(connectScribe).toHaveBeenCalledTimes(1);
    voice.destroy();
  });
});

describe("batch path", () => {
  it("records a push-to-talk segment and transcribes the blob on release", async () => {
    const recorder = new FakeRecorder();
    const { stream, stop: stopTrack } = fakeStream();
    const transcribe = vi.fn(async (_blob: Blob) => "turn left");
    const transcripts: Array<[string, boolean]> = [];
    const states: VoiceState[] = [];
    const voice = createVoice({
      onTranscript: (t, f) => transcripts.push([t, f]),
      onState: (s) => states.push(s),
      deps: {
        fetchToken: async () => ({ provider: "batch", reason: "no-key" }),
        getUserMedia: async () => stream,
        createRecorder: () => recorder,
        transcribe,
        hasMic: true,
      },
    });

    voice.start();
    await flush();
    expect(recorder.state).toBe("recording");
    expect(states).toEqual(["listening"]);

    voice.stop();
    await flush();
    expect(transcribe).toHaveBeenCalledTimes(1);
    const blob = transcribe.mock.calls[0][0];
    expect(blob.size).toBeGreaterThan(0);
    expect(transcripts).toEqual([["turn left", true]]);
    expect(stopTrack).toHaveBeenCalled();
  });

  it("does not lose a quick press-and-release: the keydown recording is transcribed", async () => {
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    const transcribe = vi.fn(async (_b: Blob) => "quick words");
    const transcripts: Array<[string, boolean]> = [];
    const voice = createVoice({
      onTranscript: (t, f) => transcripts.push([t, f]),
      onState: () => {},
      deps: {
        fetchToken: async () => ({ provider: "batch", reason: "no-key" }),
        getUserMedia,
        createRecorder: () => new FakeRecorder(),
        transcribe,
        hasMic: true,
      },
    });

    voice.start();
    voice.stop();
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcripts).toEqual([["quick words", true]]);
  });

  it("does not emit when destroyed while the transcription is in flight", async () => {
    let release: (t: string) => void = () => {};
    const transcribe = vi.fn(() => new Promise<string>((r) => (release = r)));
    const transcripts: string[] = [];
    const voice = createVoice({
      onTranscript: (t) => transcripts.push(t),
      onState: () => {},
      deps: {
        fetchToken: async () => ({ provider: "batch", reason: "no-key" }),
        getUserMedia: async () => fakeStream().stream,
        createRecorder: () => new FakeRecorder(),
        transcribe,
        hasMic: true,
      },
    });

    voice.start();
    await flush();
    voice.stop();
    await flush();
    expect(transcribe).toHaveBeenCalledTimes(1);
    voice.destroy();
    release("too late");
    await flush();
    expect(transcripts).toEqual([]);
  });

  it("falls back to browser speech recognition when transcribe answers 503", async () => {
    class FakeSpeech {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((e: SpeechResultEvent) => void) | null = null;
      onerror: ((e: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;
      started = 0;
      start() {
        this.started++;
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    const speech: FakeSpeech[] = [];
    const onEngine = vi.fn();
    const transcribe = vi.fn(async () => {
      throw new TranscribeUnavailableError();
    });
    const transcripts: Array<[string, boolean]> = [];
    const voice = createVoice({
      onTranscript: (t, f) => transcripts.push([t, f]),
      onState: () => {},
      onEngine,
      deps: {
        fetchToken: async () => ({ provider: "batch", reason: "no-key" }),
        getUserMedia: async () => fakeStream().stream,
        createRecorder: () => new FakeRecorder(),
        transcribe,
        createSpeechRecognition: () => {
          const s = new FakeSpeech();
          speech.push(s);
          return s as unknown as SpeechRecognitionLike;
        },
        hasMic: true,
      },
    });

    voice.start();
    await flush();
    voice.stop();
    await flush();
    expect(onEngine).toHaveBeenCalledWith("browser");

    voice.start();
    await flush();
    const live = speech.at(-1)!;
    expect(live.started).toBe(1);
    live.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "hel" } }] });
    live.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: " hello " } }] });
    expect(transcripts).toEqual([["hel", false], ["hello", true]]);
    expect(transcribe).toHaveBeenCalledTimes(1);
    voice.destroy();
  });

  it("reports unavailable when the microphone is denied and ignores later starts", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    const states: VoiceState[] = [];
    const voice = createVoice({
      onTranscript: () => {},
      onState: (s) => states.push(s),
      deps: {
        fetchToken: async () => ({ provider: "batch", reason: "no-key" }),
        getUserMedia,
        createRecorder: () => new FakeRecorder(),
        hasMic: true,
      },
    });

    voice.start();
    await flush();
    expect(states).toContain("unavailable");

    voice.start();
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("lock keeps recording through start/stop until the next stop", async () => {
    const recorder = new FakeRecorder();
    const transcribe = vi.fn(async () => "long dictation");
    const states: VoiceState[] = [];
    const voice = createVoice({
      onTranscript: () => {},
      onState: (s) => states.push(s),
      deps: {
        fetchToken: async () => ({ provider: "batch", reason: "no-key" }),
        getUserMedia: async () => fakeStream().stream,
        createRecorder: () => recorder,
        transcribe,
        hasMic: true,
      },
    });

    voice.lock();
    await flush();
    voice.start(); // ignored while locked
    expect(states).toEqual(["locked"]);
    expect(recorder.state).toBe("recording");

    voice.stop();
    await flush();
    expect(states).toEqual(["locked", "idle"]);
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it("destroy aborts capture without transcribing", async () => {
    const recorder = new FakeRecorder();
    const { stream, stop: stopTrack } = fakeStream();
    const transcribe = vi.fn(async () => "never");
    const transcripts: string[] = [];
    const voice = createVoice({
      onTranscript: (t) => transcripts.push(t),
      onState: () => {},
      deps: {
        fetchToken: async () => ({ provider: "batch", reason: "no-key" }),
        getUserMedia: async () => stream,
        createRecorder: () => recorder,
        transcribe,
        hasMic: true,
      },
    });

    voice.start();
    await flush();
    voice.destroy();
    await flush();
    expect(transcribe).not.toHaveBeenCalled();
    expect(transcripts).toEqual([]);
    expect(stopTrack).toHaveBeenCalled();
    voice.start(); // ignored after destroy
    expect(recorder.state).toBe("inactive");
  });
});

describe("bindKeys", () => {
  function fakeTarget() {
    const listeners: Record<string, Array<(e: unknown) => void>> = {};
    return {
      addEventListener(type: string, fn: (e: unknown) => void) {
        (listeners[type] ??= []).push(fn);
      },
      removeEventListener(type: string, fn: (e: unknown) => void) {
        listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
      },
      fire(type: string, event: Record<string, unknown>) {
        for (const fn of listeners[type] ?? []) fn(event);
      },
      count(type: string) {
        return (listeners[type] ?? []).length;
      },
    };
  }

  it("maps Option hold, double-tap lock, single-tap unlock and blur onto the controller", () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const voice = { start: vi.fn(), stop: vi.fn(), lock: vi.fn() };
    const target = fakeTarget();
    const unbind = bindKeys(voice, target);

    const down = (at: number, repeat = false) => {
      now = at;
      target.fire("keydown", { key: "Alt", repeat });
    };
    const up = (at: number) => {
      now = at;
      target.fire("keyup", { key: "Alt" });
    };

    down(0);
    expect(voice.start).toHaveBeenCalledTimes(1);
    down(30, true); // auto-repeat ignored
    up(800);
    expect(voice.stop).toHaveBeenCalledTimes(1);

    down(2_000); // start (2)
    up(2_100); // stop (2)
    down(2_200); // start (3)
    up(2_250); // double tap -> lock
    expect(voice.lock).toHaveBeenCalledTimes(1);

    down(5_000); // locked: hold does nothing
    up(5_100); // single tap unlocks -> stop (3)
    expect(voice.start).toHaveBeenCalledTimes(3);
    expect(voice.stop).toHaveBeenCalledTimes(3);

    target.fire("keydown", { key: "a" }); // other keys are ignored
    expect(voice.start).toHaveBeenCalledTimes(3);

    down(9_000); // start (4), then focus is lost mid-hold
    target.fire("blur", {});
    expect(voice.stop).toHaveBeenCalledTimes(4);

    unbind();
    expect(target.count("keydown")).toBe(0);
    expect(target.count("keyup")).toBe(0);
    expect(target.count("blur")).toBe(0);
  });
});
