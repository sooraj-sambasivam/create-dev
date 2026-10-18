import { describe, expect, it } from "vitest";
import { createManualClock } from "../sync/clock";
import type { HoverHit } from "../modes/narrate/overlay/targets";
import { createNarrateSync } from "./syncBridge";

const box = { x: 0, y: 0, w: 10, h: 10 };
const hitAt = (x: number): HoverHit | null =>
  x < 100 ? { id: "left", label: "button: Left", area: 100, box } : x < 200 ? { id: "right", label: "heading: Right", area: 400, box } : null;

function setup() {
  const clock = createManualClock(1000);
  const ns = createNarrateSync({ clock, resolveHit: hitAt });
  const dwell = (x: number, from: number, to: number) => {
    for (let t = from; t <= to; t += 10) ns.session.pointer.ingest(x, 5, t);
  };
  return { clock, ns, dwell };
}

describe("createNarrateSync", () => {
  it("binds each deictic of one line to its own node using Scribe word times", () => {
    const { clock, ns, dwell } = setup();
    dwell(50, 1000, 1700);
    dwell(150, 1710, 2600);
    ns.begin();
    ns.sink.audioStart(1000);
    clock.set(2700);
    const seen: Array<{ n: number; final: boolean }> = [];
    ns.onBound(({ bound, final }) => seen.push({ n: bound.length, final }));
    ns.sink.scribe(
      {
        message_type: "committed_transcript_with_timestamps",
        text: "Move this here",
        words: [
          { text: "Move", start: 0.1, end: 0.3, type: "word" },
          { text: "this", start: 0.4, end: 0.6, type: "word" },
          { text: "here", start: 1.9, end: 2.1, type: "word" },
        ],
      },
      2700,
    );
    const fin = ns.finish();
    expect(fin.final).toBe(true);
    expect(fin.bound.map((b) => b.targetId)).toEqual(["left", "right"]);
    expect(fin.bound[0].label).toBe("button: Left");
    expect(ns.hit("right")?.area).toBe(400);
    expect(seen.at(-1)).toEqual({ n: 2, final: true });
    ns.dispose();
  });

  it("emits an estimated binding from a partial, then refines it on the committed words", () => {
    const { clock, ns, dwell } = setup();
    dwell(50, 1000, 1900);
    ns.begin();
    ns.sink.audioStart(1000);
    clock.set(1900);
    const seen: boolean[] = [];
    ns.onBound(({ bound }) => seen.push(bound[0]?.final ?? false));
    ns.sink.scribe({ message_type: "partial_transcript", text: "make this" }, 1900);
    expect(seen).toEqual([false]);
    clock.set(2400);
    ns.sink.scribe(
      { message_type: "committed_transcript_with_timestamps", text: "make this", words: [{ text: "make", start: 0.3, end: 0.5 }, { text: "this", start: 0.55, end: 0.8 }] },
      2400,
    );
    expect(seen.at(-1)).toBe(true);
  });

  it("ignores speech from before begin() and does not hand out an utterance twice", () => {
    const { clock, ns, dwell } = setup();
    dwell(50, 1000, 1900);
    clock.set(1900);
    ns.sink.scribe({ message_type: "partial_transcript", text: "this" }, 1900);
    expect(ns.current().bound).toEqual([]);
    ns.begin();
    expect(ns.current().bound.length).toBe(1);
    expect(ns.finish().bound.length).toBe(1);
    ns.begin();
    expect(ns.finish().bound.length).toBe(0);
  });

  it("feeds browser speech through the lag estimator", () => {
    const { clock, ns, dwell } = setup();
    dwell(50, 1000, 2200);
    ns.begin();
    clock.set(2200);
    ns.sink.speech("1:0", "delete that", false, 2200);
    expect(ns.current().bound[0]?.targetId).toBe("left");
  });
});
