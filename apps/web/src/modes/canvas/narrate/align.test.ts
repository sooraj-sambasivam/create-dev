import { describe, expect, it } from "vitest";
import { alignUtterances, createSpeechTracker } from "./align";
import type { PathPoint } from "./geometry";

const pt = (t: number, id: string | null): PathPoint => ({ t, x: t, y: 0, id });

describe("createSpeechTracker", () => {
  it("opens a span at the first interim and closes it at the final", () => {
    const s = createSpeechTracker();
    s.onTranscript("make", false, 1000);
    s.onTranscript("make this bigger", false, 1800);
    expect(s.hasPending()).toBe(true);
    s.onTranscript("Make this bigger.", true, 2400);
    expect(s.spans).toEqual([{ start: 1000, end: 2400, text: "Make this bigger." }]);
    expect(s.hasPending()).toBe(false);
  });
  it("estimates a start for final-only transcripts without overlapping the previous span", () => {
    const s = createSpeechTracker();
    s.onTranscript("one two three four five", true, 5000);
    expect(s.spans[0].start).toBe(3000);
    s.onTranscript("another one here", true, 5500);
    expect(s.spans[1].start).toBe(5000);
  });
  it("flush closes a dangling interim", () => {
    const s = createSpeechTracker();
    s.onTranscript("hello", false, 100);
    s.flush(900);
    expect(s.spans).toEqual([{ start: 100, end: 900, text: "hello" }]);
  });
  it("tracks activity", () => {
    const s = createSpeechTracker();
    s.onTranscript("hi", true, 100);
    expect(s.isActive(500)).toBe(true);
    expect(s.isActive(5000)).toBe(false);
  });
});

describe("alignUtterances", () => {
  const path: PathPoint[] = [pt(0, null), pt(1000, "hero"), pt(2500, "btn"), pt(4000, null), pt(6000, "card"), pt(7000, null)];
  it("links each utterance to the shapes hovered during it, in order", () => {
    const out = alignUtterances(
      [
        { start: 1200, end: 3500, text: "headline then button" },
        { start: 5800, end: 6800, text: "this card" },
      ],
      path,
      [],
      8000,
    );
    expect(out[0].targetIds).toEqual(["hero", "btn"]);
    expect(out[1].targetIds).toEqual(["card"]);
  });
  it("ignores brief grazes but keeps the longest as a fallback", () => {
    const p = [pt(0, null), pt(1000, "a"), pt(1050, null)];
    const out = alignUtterances([{ start: 900, end: 1100, text: "x" }], p, [], 3000);
    expect(out[0].targetIds).toEqual(["a"]);
    const strong = alignUtterances([{ start: 900, end: 1100, text: "x" }], [pt(0, null), pt(1000, "a"), pt(1050, "b"), pt(1200, null)], [], 3000);
    expect(strong[0].targetIds).toEqual(["b"]);
  });
  it("gives a lasso to the first utterance after it, once", () => {
    const out = alignUtterances(
      [
        { start: 3000, end: 4000, text: "these" },
        { start: 4500, end: 5000, text: "and then" },
      ],
      [pt(0, null)],
      [{ t: 1500, ids: ["a", "b"] }],
      6000,
    );
    expect(out[0].targetIds).toEqual(["a", "b"]);
    expect(out[1].targetIds).toEqual([]);
  });
  it("does not use a lasso older than the lead window", () => {
    const out = alignUtterances([{ start: 9000, end: 9500, text: "x" }], [], [{ t: 1000, ids: ["a"] }], 10000);
    expect(out[0].targetIds).toEqual([]);
  });
  it("caps targets", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `s${i}`);
    const out = alignUtterances([{ start: 0, end: 1000, text: "all" }], [], [{ t: 0, ids }], 2000);
    expect(out[0].targetIds).toHaveLength(8);
  });
});
