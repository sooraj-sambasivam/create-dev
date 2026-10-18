import { describe, expect, it } from "vitest";
import {
  TimeRing,
  isDeictic,
  pointerAt,
  resolveDeixis,
  type TimedPointer,
  type TimedWord,
} from "./timeline";

// Targets laid out on a line: A [0,100), B [200,300), C [400,500); gaps are blank.
const targetAt = (x: number): { targetId?: string; label?: string } => {
  for (const [id, lo] of [["A", 0], ["B", 200], ["C", 400]] as const) {
    if (x >= lo && x < lo + 100) return { targetId: id, label: `btn-${id}` };
  }
  return {};
};

/** Piecewise-linear pointer path through [t, x] knots sampled at hz. */
function path(knots: Array<[number, number]>, hz = 120, ring = new TimeRing<TimedPointer>(4096)) {
  const dt = 1000 / hz;
  for (let t = knots[0][0]; t <= knots[knots.length - 1][0]; t += dt) {
    let k = 0;
    while (k < knots.length - 2 && knots[k + 1][0] <= t) k++;
    const [t0, x0] = knots[k];
    const [t1, x1] = knots[k + 1];
    const x = t1 === t0 ? x1 : x0 + ((x1 - x0) * (t - t0)) / (t1 - t0);
    ring.push({ t, x, y: 50, ...targetAt(x) });
  }
  return ring;
}

const w = (text: string, start: number, dur = 250): TimedWord => ({
  text,
  start,
  end: start + dur,
  final: true,
  source: "injected",
});

describe("TimeRing", () => {
  it("evicts oldest at capacity and keeps lookups correct across wraparound", () => {
    const r = new TimeRing<{ t: number }>(8);
    for (let i = 0; i < 20; i++) r.push({ t: i * 10 });
    expect(r.length).toBe(8);
    expect(r.first()!.t).toBe(120);
    expect(r.last()!.t).toBe(190);
    expect(r.atOrBefore(155)).toBe(3);
    expect(r.atOrBefore(100)).toBe(-1);
    expect(r.lowerBound(155)).toBe(4);
    expect(r.nearest(154)!.t).toBe(150);
    expect(r.nearest(156)!.t).toBe(160);
    expect(r.nearest(-5)!.t).toBe(120);
    expect(r.nearest(1e9)!.t).toBe(190);
    expect(r.range(130, 160).map((x) => x.t)).toEqual([130, 140, 150, 160]);
  });
  it("drops by maxAge and clamps out-of-order pushes", () => {
    const r = new TimeRing<{ t: number }>(100, 50);
    for (let i = 0; i <= 10; i++) r.push({ t: i * 10 });
    expect(r.first()!.t).toBe(50);
    expect(r.push({ t: 5 }).t).toBe(100);
  });
  it("handles empty and is fast on 100k lookups", () => {
    const r = new TimeRing<{ t: number }>(1000);
    expect(r.nearest(1)).toBeUndefined();
    expect(r.atOrBefore(1)).toBe(-1);
    for (let i = 0; i < 5000; i++) r.push({ t: i });
    const t0 = performance.now();
    for (let i = 0; i < 100000; i++) r.atOrBefore(4000 + (i % 900));
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("pointerAt interpolation", () => {
  it("interpolates position, steps target, clamps ends", () => {
    const r = new TimeRing<TimedPointer>(10);
    r.push({ t: 0, x: 0, y: 0, targetId: "A" });
    r.push({ t: 100, x: 100, y: 50, targetId: "B" });
    const p = pointerAt(r, 25)!;
    expect(p.x).toBeCloseTo(25);
    expect(p.y).toBeCloseTo(12.5);
    expect(p.targetId).toBe("A");
    expect(pointerAt(r, -10)!.x).toBe(0);
    expect(pointerAt(r, 500)!.targetId).toBe("B");
    expect(pointerAt(new TimeRing<TimedPointer>(2), 1)).toBeUndefined();
  });
});

describe("isDeictic", () => {
  it("matches deictic words with punctuation/case", () => {
    for (const s of ["this", "That.", "THESE,", "those", "here", "there!", "it", "one"]) {
      expect(isDeictic(s)).toBe(true);
    }
    for (const s of ["move", "thing", "item", "the", ""]) expect(isDeictic(s)).toBe(false);
  });
});

describe("resolveDeixis", () => {
  it("steady hover: binds to the held target with high confidence", () => {
    const r = path([[0, 50], [2000, 50]]);
    const [b] = resolveDeixis([w("move", 900), w("this", 1000)], r);
    expect(b.target?.targetId).toBe("A");
    expect(b.mode).toBe("dwell");
    expect(b.confidence).toBeGreaterThan(0.9);
    expect(b.target?.label).toBe("btn-A");
  });

  it("hover change: word timing picks the target current at that word, not at the end", () => {
    // on A until 1000, quick move, on B from 1100 on
    const r = path([[0, 50], [1000, 50], [1100, 250], [3000, 250]]);
    const [a, b] = resolveDeixis([w("this", 600), w("that", 2000)], r);
    expect(a.target?.targetId).toBe("A");
    expect(b.target?.targetId).toBe("B");
  });

  it("fast sweep across B between A and C: ignores swept target, picks settled dwell", () => {
    // dwell A until 500, sweep over B (~25ms in B) to C by 560, dwell C
    const r = path([[0, 50], [500, 50], [560, 450], [2000, 450]]);
    // word said mid-sweep, just after leaving A -> most recent dwell A or approaching C; never B
    for (const start of [505, 520, 535, 550]) {
      const [b] = resolveDeixis([w("this", start)], r);
      expect(b.target?.targetId, `start=${start}`).not.toBe("B");
      expect(["A", "C"]).toContain(b.target?.targetId);
      expect(b.confidence).toBeLessThan(0.55);
    }
    // closer to arrival it is "approaching C"; right after leaving it is "recent A"
    expect(resolveDeixis([w("this", 505)], r)[0].target?.targetId).toBe("A");
    expect(resolveDeixis([w("this", 555)], r)[0].target?.targetId).toBe("C");
    // once settled on C: full confidence
    const settled = resolveDeixis([w("this", 800)], r)[0];
    expect(settled.target?.targetId).toBe("C");
    expect(settled.mode).toBe("dwell");
  });

  it("two deictics: 'move this here' binds each at its own time", () => {
    // A held 0-900, travel to C 900-1000, C held after
    const r = path([[0, 50], [900, 50], [1000, 450], [3000, 450]]);
    const words = [w("move", 300), w("this", 500, 200), w("here", 1700, 250)];
    const out = resolveDeixis(words, r);
    expect(out).toHaveLength(2);
    expect(out[0].word.text).toBe("this");
    expect(out[0].target?.targetId).toBe("A");
    expect(out[1].target?.targetId).toBe("C");
    expect(out.every((b) => b.confidence > 0.8)).toBe(true);
  });

  it("two deictics fast apart (A then C, 400 ms between words)", () => {
    const r = path([[0, 50], [700, 50], [760, 450], [3000, 450]]);
    const out = resolveDeixis([w("this", 500, 150), w("here", 900, 150)], r);
    expect(out.map((b) => b.target?.targetId)).toEqual(["A", "C"]);
  });

  it("late ASR: webspeech-style words delivered late are fixed by lagMs", () => {
    // pointer moves A -> B at 1000. User says "this" at ~1100 (on B), recognizer reports start=1550 (450 late).
    const r = path([[0, 50], [1000, 50], [1060, 250], [3000, 250]]);
    const late: TimedWord = { ...w("this", 1550), source: "webspeech" };
    expect(resolveDeixis([late], r, { lagMs: 0 })[0].target?.targetId).toBe("B");
    // a pointer that has since moved on to C: without lag compensation we bind wrongly
    const r2 = path([[0, 50], [1000, 50], [1060, 250], [1400, 250], [1460, 450], [3000, 450]]);
    expect(resolveDeixis([late], r2, { lagMs: 0 })[0].target?.targetId).toBe("C");
    expect(resolveDeixis([late], r2, { lagMs: 450 })[0].target?.targetId).toBe("B");
  });

  it("missing timestamps: NaN start yields unbound, zero confidence (no throw)", () => {
    const r = path([[0, 50], [1000, 50]]);
    const bad: TimedWord = { text: "this", start: NaN, end: NaN, final: false, source: "injected" };
    const [b] = resolveDeixis([bad], r);
    expect(b.target).toBeNull();
    expect(b.confidence).toBe(0);
  });

  it("empty pointer buffer and blank-only pointer: unbound", () => {
    expect(resolveDeixis([w("this", 100)], new TimeRing<TimedPointer>(10))[0].target).toBeNull();
    const blank = path([[0, 150], [1000, 150]]);
    const [b] = resolveDeixis([w("this", 500)], blank);
    expect(b.target).toBeNull();
    expect(b.mode).toBe("none");
  });

  it("word before first sample / after last sample degrade gracefully", () => {
    const r = path([[1000, 50], [2000, 50]]);
    const [early] = resolveDeixis([w("this", 100)], r);
    expect(early.target?.targetId).toBe("A");
    expect(early.confidence).toBeLessThan(0.5);
    const [late] = resolveDeixis([w("this", 9000)], r);
    expect(late.target?.targetId).toBe("A");
  });

  it("recent dwell beats blank gap: said just after leaving target into empty space", () => {
    const r = path([[0, 50], [800, 50], [900, 150], [3000, 150]]);
    const [b] = resolveDeixis([w("that", 1000)], r);
    expect(b.target?.targetId).toBe("A");
    expect(b.mode).toBe("recent");
    expect(b.confidence).toBeLessThan(0.5);
  });

  it("jittery 8 ms sampling with a coarse 30 Hz pointer both bind correctly", () => {
    for (const hz of [30, 60, 120, 240]) {
      const r = path([[0, 50], [1000, 50], [1100, 250], [3000, 250]], hz);
      const out = resolveDeixis([w("this", 500), w("that", 2000)], r);
      expect(out.map((b) => b.target?.targetId), `${hz}Hz`).toEqual(["A", "B"]);
    }
  });
});
