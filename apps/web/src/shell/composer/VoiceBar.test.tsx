import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VoiceBar } from "./VoiceBar";
import { MIC_UNSUPPORTED_NOTICE, type VoiceState } from "./voice";

const noop = () => {};
const render = (state: VoiceState) =>
  renderToStaticMarkup(<VoiceBar state={state} level={0} onRetry={noop} onDismiss={noop} />);

describe("VoiceBar notice", () => {
  it("shows the unsupported-browser notice on one line", () => {
    const html = render({ phase: "notice", message: MIC_UNSUPPORTED_NOTICE, blocked: "x" });
    expect(html).toContain('data-phase="notice"');
    expect(html.replaceAll("&#x27;", "'")).toContain(MIC_UNSUPPORTED_NOTICE);
    expect(html).toContain("truncate");
    expect(html).not.toContain("<button");
  });

  it("says which microphone problem it is, in plain words", () => {
    const txt = (state: VoiceState) => render(state).replaceAll("&#x27;", "'");
    expect(txt({ phase: "unavailable", message: "Microphone access was denied.", blocked: "x" })).toContain("Microphone blocked. Allow it in your browser settings, or type.");
    expect(txt({ phase: "unavailable", message: "This browser can't record audio.", blocked: "x" })).toContain("This browser can't use the microphone. Type instead.");
    expect(txt({ phase: "transcribing", message: null, blocked: null })).toContain("Turning your voice into text");
  });
});
