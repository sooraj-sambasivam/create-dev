import { describe, expect, it, vi } from "vitest";
import { chooseEngine, getSpeechCtor, joinResults, probeTranscribe, speechErrorEvent } from "./speech";

describe("voice engine fallback decision", () => {
  it("uses the browser only when the server has no key and SpeechRecognition exists", () => {
    expect(chooseEngine(503, true)).toBe("browser");
    expect(chooseEngine(503, false)).toBe("server"); // keeps the "type your prompt instead" message
    expect(chooseEngine(400, true)).toBe("server"); // key configured
    expect(chooseEngine(null, true)).toBe("server"); // probe failed
  });
  it("detects prefixed and unprefixed constructors", () => {
    class R {}
    expect(getSpeechCtor({ webkitSpeechRecognition: R })).toBe(R);
    expect(getSpeechCtor({ SpeechRecognition: R })).toBe(R);
    expect(getSpeechCtor({})).toBeNull();
  });
  it("probe returns the status, or null on network failure", async () => {
    expect(await probeTranscribe(vi.fn().mockResolvedValue({ status: 503 }) as unknown as typeof fetch)).toBe(503);
    expect(await probeTranscribe(vi.fn().mockRejectedValue(new Error("x")) as unknown as typeof fetch)).toBeNull();
  });
  it("joins results and maps errors", () => {
    expect(joinResults([{ isFinal: true, 0: { transcript: "hello " } }, { isFinal: false, 0: { transcript: " world" } }])).toBe("hello world");
    expect(speechErrorEvent("not-allowed").type).toBe("deny");
    expect(speechErrorEvent("no-speech").type).toBe("fail");
    expect(speechErrorEvent("network").type).toBe("fail");
  });
});
