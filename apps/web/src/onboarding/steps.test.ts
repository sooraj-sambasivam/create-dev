import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  STEP_COUNT, browserFixCopy, classifyMicError, clampStep, defaultModeFor, detectBrowser, growHeading, isLastStep, isMacPlatform, levelFromBytes,
  micStatus, nextStep, openMic, pointingHint, prevStep, requestMic, sampleReply, setupSummary, shouldShowOnboarding,
} from "./steps";
import { resolveDeviceId } from "./permissions";

describe("onboarding steps", () => {
  it("maps intent to the default mode", () => {
    expect(defaultModeFor("ask")).toBe("chat");
    expect(defaultModeFor("build")).toBe("code");
    expect(defaultModeFor("both")).toBe("code");
  });
  it("clamps navigation across five steps", () => {
    expect(STEP_COUNT).toBe(5);
    expect(prevStep(0)).toBe(0);
    expect(nextStep(4)).toBe(4);
    expect(nextStep(0)).toBe(1);
    expect(clampStep(9)).toBe(4);
    expect(isLastStep(4)).toBe(true);
    expect(isLastStep(3)).toBe(false);
  });
  it("shows on first run or ?onboarding=1, never on the shared viewer", () => {
    expect(shouldShowOnboarding(false, "", null)).toBe(true);
    expect(shouldShowOnboarding(true, "", null)).toBe(false);
    expect(shouldShowOnboarding(true, "?onboarding=1", null)).toBe(true);
    expect(shouldShowOnboarding(false, "?p=abc", "abc")).toBe(false);
  });
  it("hints per path and summary", () => {
    expect(pointingHint("chat")).toContain("4.9");
    expect(pointingHint("code")).toContain("make this bigger");
    expect(setupSummary("both", "dev")).toBe("Both · I'm a developer");
  });
  it("answers the sample commands and close variants", () => {
    expect(sampleReply("What does 4.9 mean?")).toMatchObject({ kind: "answer" });
    expect(sampleReply("what's 4.9")).toMatchObject({ kind: "answer" });
    expect(sampleReply("What does this mean?")).toMatchObject({ kind: "answer" });
    expect(sampleReply("  make this   bigger ")).toEqual({ kind: "bigger" });
    expect(sampleReply("Make it bigger!")).toEqual({ kind: "bigger" });
    expect(sampleReply("increase size")).toEqual({ kind: "bigger" });
    expect(sampleReply("hello")).toBeNull();
    expect(growHeading(0)).toBe(1);
    expect(growHeading(2)).toBe(2);
  });
});

describe("microphone", () => {
  it("requests the mic and releases it", async () => {
    const stop = vi.fn();
    const ok = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }, { stop }] }) };
    expect(await requestMic(ok)).toBe("granted");
    expect(stop).toHaveBeenCalledTimes(2);
    expect(await requestMic({ getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) })).toBe("denied");
    expect(await requestMic(undefined)).toBe("unsupported");
  });
  it("maps errors to what the person can act on", () => {
    expect(classifyMicError("NotAllowedError")).toBe("denied");
    expect(classifyMicError("NotReadableError")).toBe("denied");
    expect(classifyMicError("NotFoundError")).toBe("no-device");
  });
  it("opens a chosen device as an ideal constraint and keeps the stream", async () => {
    const stream = { getTracks: () => [] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const r = await openMic({ getUserMedia }, "abc");
    expect(r).toEqual({ result: "granted", stream });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { deviceId: { ideal: "abc" } } });
    const nf = await openMic({ getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotFoundError" })) });
    expect(nf.result).toBe("no-device");
  });
  it("derives the status from the browser first", () => {
    expect(micStatus("granted", null, "unknown")).toBe("granted");
    expect(micStatus("denied", null, "granted")).toBe("blocked");
    expect(micStatus("prompt", null, "granted")).toBe("not-now");
    expect(micStatus("prompt", null, "unknown")).toBe("unknown");
    expect(micStatus(null, "denied", "unknown")).toBe("blocked");
    expect(micStatus(null, "no-device", "unknown")).toBe("not-now");
    expect(micStatus(null, "granted", "not-now")).toBe("granted");
  });
  it("gives browser specific fix text", () => {
    const chrome = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
    const safari = "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15";
    expect(detectBrowser(chrome)).toBe("chrome");
    expect(detectBrowser(safari)).toBe("safari");
    expect(browserFixCopy(chrome)).toContain("tune icon");
    expect(browserFixCopy(safari)).toContain("Settings for This Website");
    expect(browserFixCopy("curl")).toContain("site settings");
  });
  it("computes the level and platform", () => {
    expect(levelFromBytes(new Uint8Array(64).fill(128))).toBe(0);
    expect(levelFromBytes(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0)))).toBe(1);
    expect(levelFromBytes([])).toBe(0);
    expect(isMacPlatform("MacIntel")).toBe(true);
    expect(isMacPlatform("Win32")).toBe(false);
  });
  it("trusts a stored device only while the browser lists it", () => {
    expect(resolveDeviceId("a", [{ id: "a" }])).toBe("a");
    expect(resolveDeviceId("gone", [{ id: "a" }])).toBeNull();
    expect(resolveDeviceId(null, [{ id: "a" }])).toBeNull();
  });
});

describe("onboarding and settings source rules", () => {
  const dirs = [__dirname, join(__dirname, "../settings")];
  const files = dirs.flatMap((d) => readdirSync(d).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")).map((f) => join(d, f)));
  it("has no scrim, blur, raw hex or palette colours", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/bg-black|backdrop-blur|#[0-9a-fA-F]{6}\b|\b(?:bg|text|border)-(?:red|green|blue|gray|slate|zinc|amber|emerald)-/);
      expect(src, f).not.toMatch(/var\(--c-/);
    }
  });
  it("asks for no notification permission", () => {
    const all = readdirSync(join(__dirname, "..")).length; // sanity: src dir readable
    expect(all).toBeGreaterThan(0);
    for (const f of files) expect(readFileSync(f, "utf8")).not.toContain("Notification.requestPermission");
  });
});
