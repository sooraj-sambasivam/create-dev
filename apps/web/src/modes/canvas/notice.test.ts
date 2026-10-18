import { describe, expect, it } from "vitest";
import { classifyNarrateNotice } from "./notice";

describe("classifyNarrateNotice", () => {
  it("treats the server-to-browser speech fallback as info", () => {
    expect(classifyNarrateNotice("Server transcription is unavailable; using browser speech recognition for the next segments")).toBe("info");
  });

  it("keeps real failures as errors", () => {
    expect(classifyNarrateNotice("Transcription failed: timeout")).toBe("error");
    expect(classifyNarrateNotice("Browser speech recognition: not-allowed")).toBe("error");
    expect(classifyNarrateNotice("Transcription is unavailable and this browser has no speech recognition")).toBe("error");
    expect(classifyNarrateNotice("I didn't catch anything. Speak while you point, then press Done.")).toBe("error");
  });
});
