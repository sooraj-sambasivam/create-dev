import { describe, expect, it } from "vitest";
import { micLabel } from "./MicPill";

describe("micLabel", () => {
  it("names each state", () => {
    expect(micLabel("idle")).toBe("Mic off");
    expect(micLabel("listening")).toBe("Listening");
    expect(micLabel("locked")).toBe("Listening (locked)");
    expect(micLabel("unavailable")).toBe("Speech recognition isn't available in this browser");
  });

  it("appends the hint after a middle dot", () => {
    expect(micLabel("listening", "Using browser speech recognition")).toBe(
      "Listening · Using browser speech recognition",
    );
  });
});
