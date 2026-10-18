import { describe, expect, it, vi } from "vitest";
import {
  clampStep, defaultModeFor, growHeading, sampleReply, isLastStep, nextStep, pointingHint, prevStep, requestMic, setupSummary, shouldShowOnboarding,
} from "./steps";

describe("onboarding steps", () => {
  it("maps intent to the default mode", () => {
    expect(defaultModeFor("ask")).toBe("chat");
    expect(defaultModeFor("build")).toBe("code");
    expect(defaultModeFor("both")).toBe("code");
  });
  it("clamps navigation", () => {
    expect(prevStep(0)).toBe(0);
    expect(nextStep(2)).toBe(2);
    expect(nextStep(0)).toBe(1);
    expect(clampStep(9)).toBe(2);
    expect(isLastStep(2)).toBe(true);
    expect(isLastStep(1)).toBe(false);
  });
  it("shows on first run or ?onboarding=1, never on the shared viewer", () => {
    expect(shouldShowOnboarding(false, "", null)).toBe(true);
    expect(shouldShowOnboarding(true, "", null)).toBe(false);
    expect(shouldShowOnboarding(true, "?onboarding=1", null)).toBe(true);
    expect(shouldShowOnboarding(false, "?p=abc", "abc")).toBe(false);
  });
  it("hints per mode and summary", () => {
    expect(pointingHint("chat")).toContain("4.9");
    expect(pointingHint("code")).toContain("make this bigger");
    expect(setupSummary("both", "dev")).toBe("Both · I'm a developer");
  });
  it("requests the mic and releases it", async () => {
    const stop = vi.fn();
    const ok = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }, { stop }] }) };
    expect(await requestMic(ok)).toBe("granted");
    expect(stop).toHaveBeenCalledTimes(2);
    expect(await requestMic({ getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) })).toBe("denied");
    expect(await requestMic(undefined)).toBe("unsupported");
  });
  it("answers the two sample commands", () => {
    expect(sampleReply("What does this mean?")).toMatchObject({ kind: "answer" });
    expect(sampleReply("  make this   bigger ")).toEqual({ kind: "bigger" });
    expect(sampleReply("hello")).toBeNull();
    expect(growHeading(0)).toBe(1);
    expect(growHeading(2)).toBe(2);
  });
});
