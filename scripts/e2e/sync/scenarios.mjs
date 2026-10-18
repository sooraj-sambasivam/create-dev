import { Path, HOME } from "./path.mjs";
/**
 * Each scenario: an utterance (synthesized with TTS) and build(d) -> { path, expect }.
 * d[i] = {start,end} (ms, audio-file timeline) of the i-th deictic word as measured by
 * ElevenLabs speech-to-text on the synthesized audio. Paths are laid out RELATIVE to those
 * ground-truth word times, so the intended target at each deictic is known by construction.
 * (The word times in the spec's example, e.g. "this" at 600 ms, depend on the TTS render;
 * here "this" lands wherever STT measures it and the pointer is placed around that instant.)
 */
export const SCENARIOS = [
  {
    id: "make-this-bigger", text: "Make this bigger.", desc: "single deictic, settled dwell on C",
    build(d) { const T = d[0].start;
      const p = new Path(HOME, 1000).move("C", T - 900, T - 450).holdUntil(T + 700);
      return { path: p, expect: ["C"] }; },
  },
  {
    id: "move-this-over-here", text: "Move this, over here, please.", desc: "two deictics, two targets (B then E)",
    build(d) { const T0 = d[0].start, T1 = d[1].start, g = T1 - T0;
      const p = new Path(HOME, 1000).move("B", T0 - 900, T0 - 450).holdUntil(T0 + 0.3 * g)
        .move("E", T0 + 0.3 * g, T1 - 0.3 * g).holdUntil(T1 + 600);
      return { path: p, expect: ["B", "E"] }; },
  },
  {
    id: "that-after-leaving", text: "Look at that.", desc: "fast sweep; 'that' said 80 ms after leaving D",
    build(d) { const T = d[0].start;
      const p = new Path(HOME, 1000).move("D", T - 1100, T - 700).holdUntil(T - 80)
        .move("F", T - 80, T + 300).holdUntil(T + 900);
      return { path: p, expect: ["D"] }; },
  },
  {
    id: "steady-hover", text: "Delete that please.", desc: "steady hover with hand jitter on A",
    build(d) { const T = d[0].start;
      const p = new Path(HOME, 1000).move("A", T - 1100, T - 800).holdUntil(T + 700, 4);
      return { path: p, expect: ["A"] }; },
  },
  {
    id: "hover-change", text: "Select this item.", desc: "pointer jumps A to D 250 ms before the word",
    build(d) { const T = d[0].start;
      const p = new Path(HOME, 1000).move("A", T - 1300, T - 1000).holdUntil(T - 450)
        .move("D", T - 450, T - 250).holdUntil(T + 600);
      return { path: p, expect: ["D"] }; },
  },
  {
    id: "slow-pass-short-dwell", text: "Check this out.", desc: "slow pass with a 220 ms dwell on E centered on the word",
    build(d) { const T = d[0].start;
      const p = new Path(HOME, 1000).move("A", T - 1700, T - 1400).move("E", T - 1250, T - 110).holdUntil(T + 110)
        .move("C", T + 110, T + 1000);
      return { path: p, expect: ["E"] }; },
  },
  {
    id: "compare-this-with-that", text: "Compare this with that.", desc: "two deictics, far targets (A then F), fast transit",
    build(d) { const T0 = d[0].start, T1 = d[1].start, g = T1 - T0;
      const p = new Path(HOME, 1000).move("A", T0 - 1000, T0 - 600).holdUntil(T0 + 0.4 * g)
        .move("F", T0 + 0.4 * g, T1 - 0.35 * g).holdUntil(T1 + 600);
      return { path: p, expect: ["A", "F"] }; },
  },
  {
    id: "put-these-here", text: "Put these here.", desc: "two deictics close in time (C then B)",
    build(d) { const T0 = d[0].start, T1 = d[1].start, g = T1 - T0;
      const p = new Path(HOME, 1000).move("C", T0 - 1000, T0 - 500).holdUntil(T0 + 0.3 * g)
        .move("B", T0 + 0.3 * g, T1 - 0.3 * g).holdUntil(T1 + 600);
      return { path: p, expect: ["C", "B"] }; },
  },
];
