import { describe, expect, it } from "vitest";
import { formatElapsed, initialVoiceState, isDenied, unsupportedReason, voiceActive, voiceReducer, type VoiceEvent, type VoiceState } from "./voice";

const run = (s: VoiceState, ...e: VoiceEvent[]) => e.reduce(voiceReducer, s);
const idle = initialVoiceState();

describe("voice reducer", () => {
  it("happy path", () => {
    expect(run(idle, { type: "start" }).phase).toBe("requesting");
    expect(run(idle, { type: "start" }, { type: "granted" }).phase).toBe("listening");
    expect(run(idle, { type: "start" }, { type: "granted" }, { type: "stop" }).phase).toBe("transcribing");
    const done = run(idle, { type: "start" }, { type: "granted" }, { type: "stop" }, { type: "transcribed" });
    expect(done.phase).toBe("done");
    expect(run(done, { type: "dismiss" }).phase).toBe("idle");
  });
  it("ignores out-of-order events", () => {
    expect(run(idle, { type: "granted" })).toBe(idle);
    expect(run(idle, { type: "stop" })).toBe(idle);
    expect(run(idle, { type: "transcribed" })).toBe(idle);
    expect(run(idle, { type: "fail", message: "x" })).toBe(idle);
    const listening = run(idle, { type: "start" }, { type: "granted" });
    expect(run(listening, { type: "start" })).toBe(listening);
  });
  it("errors can retry or dismiss", () => {
    const err = run(idle, { type: "start" }, { type: "fail", message: "boom" });
    expect(err).toMatchObject({ phase: "error", message: "boom" });
    expect(run(err, { type: "start" }).phase).toBe("requesting");
    expect(run(err, { type: "dismiss" })).toMatchObject({ phase: "idle", message: null });
  });
  it("denial blocks the mic until reload", () => {
    const denied = run(idle, { type: "start" }, { type: "deny", message: "Microphone access was denied." });
    expect(denied.phase).toBe("unavailable");
    const after = run(denied, { type: "dismiss" });
    expect(after.phase).toBe("idle");
    expect(after.blocked).toBeTruthy();
    expect(run(after, { type: "start" }).phase).toBe("idle");
  });
  it("unsupported browsers start blocked", () => {
    const s = initialVoiceState(unsupportedReason({}));
    expect(s.blocked).toBeTruthy();
    expect(run(s, { type: "start" })).toBe(s);
    expect(unsupportedReason({ MediaRecorder: class {}, mediaDevices: { getUserMedia: () => 1 } })).toBeNull();
  });
  it("helpers", () => {
    expect(voiceActive(idle)).toBe(false);
    expect(voiceActive(run(idle, { type: "start" }))).toBe(true);
    expect(isDenied("Microphone access was denied. Allow it")).toBe(true);
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});
