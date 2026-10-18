import { describe, expect, it } from "vitest";
import { createManualClock } from "./clock";
import { createFrameTrack } from "./frameTrack";
import { createLagEstimator, DEFAULT_LAG_MS } from "./lag";
import { createPointerTrack } from "./pointerTrack";
import { createSyncSession, type SyncBinding } from "./index";
import { createScribeAdapter, createWebSpeechAdapter, estimateWordDurationMs, placeWords } from "./wordTrack";

const resolver = (x: number) => {
  if (x < 100) return { targetId: "A", label: "Alpha" };
  if (x >= 400 && x < 500) return { targetId: "C", label: "Charlie" };
  if (x >= 200 && x < 300) return { targetId: "B", label: "Bravo" };
  return undefined;
};

describe("clock", () => {
  it("maps audio context time via getOutputTimestamp, epoch and remote monotonic", () => {
    const c = createManualClock(5000, 1_000_000);
    const t = c.fromAudioContextTime(
      { currentTime: 3, getOutputTimestamp: () => ({ contextTime: 2, performanceTime: 4000 }) },
      2.5,
    );
    expect(t).toBe(4500);
    expect(c.fromAudioContextTime({ currentTime: 3 }, 3.25)).toBe(5250); // fallback
    expect(c.toEpoch(5000)).toBe(1_005_000);
    expect(c.fromEpoch(1_006_000)).toBe(6000);
    const map = c.remoteMonotonic({ remoteSec: 100, localMs: 5000 });
    expect(map(100.5)).toBe(5500);
  });
});

describe("placeWords / duration", () => {
  it("lays words contiguously ending at endT and respects the floor", () => {
    const p = placeWords(["move", "this"], 1000);
    expect(p[1].end).toBeCloseTo(1000);
    expect(p[0].end).toBeCloseTo(p[1].start);
    const q = placeWords(["move", "this", "here"], 1000, 800);
    expect(q[0].start).toBeGreaterThanOrEqual(800 - 1e-6);
    expect(q[2].end).toBeCloseTo(1000);
    expect(estimateWordDurationMs("a")).toBe(185);
    expect(estimateWordDurationMs("internationalization")).toBe(700);
  });
});

describe("WebSpeech adapter", () => {
  it("grows interim words, keeps earlier times, subtracts lag, handles revision and final", () => {
    const clock = createManualClock();
    const a = createWebSpeechAdapter({ clock, lagMs: () => 450 });
    const u1 = a.handle("r0", "move", false, 1000);
    expect(u1.words[0].end).toBeCloseTo(550);
    expect(u1.words[0].source).toBe("webspeech");
    const u2 = a.handle("r0", "move this", false, 1350);
    expect(u2.words[0]).toMatchObject({ text: "move", start: u1.words[0].start });
    expect(u2.words[1].end).toBeCloseTo(900);
    expect(u2.words[1].start).toBeGreaterThanOrEqual(u2.words[0].end - 1e-6);
    // ASR revises the text of an existing word: time retained
    const u3 = a.handle("r0", "move these", false, 1400);
    expect(u3.words[1].text).toBe("these");
    expect(u3.words[1].start).toBe(u2.words[1].start);
    const f = a.handle("r0", "move these here", true, 2000);
    expect(f.words).toHaveLength(3);
    expect(f.words.every((w) => w.final)).toBe(true);
  });
});

describe("Scribe adapter", () => {
  it("maps committed word timestamps via the audio start offset and ignores spacing", () => {
    const clock = createManualClock();
    const a = createScribeAdapter({ clock, audioStartMs: 10_000 });
    const [u] = a.handle({
      message_type: "committed_transcript_with_timestamps",
      text: "Move this here",
      words: [
        { text: "Move", start: 1.08, end: 1.3, type: "word" },
        { text: " ", start: 1.3, end: 1.34, type: "spacing" },
        { text: "this", start: 1.34, end: 1.5, type: "word" },
        { text: "here", start: 1.54, end: 1.8, type: "word" },
      ],
    });
    expect(u.words.map((w) => w.text)).toEqual(["Move", "this", "here"]);
    expect(u.words[1].start).toBeCloseTo(11340);
    expect(u.drop).toContain("scribe:partial");
    expect(u.words.every((w) => w.final && w.source === "scribe")).toBe(true);
  });

  it("partials are estimated with partial lag, then replaced on commit", () => {
    const clock = createManualClock();
    const a = createScribeAdapter({ clock, audioStartMs: 0 });
    const [p] = a.handle({ message_type: "partial_transcript", text: "move this" }, 2000);
    expect(p.key).toBe("scribe:partial");
    expect(p.words[1].end).toBeCloseTo(1800);
    expect(p.words.every((w) => !w.final)).toBe(true);
    const [c] = a.handle({ message_type: "committed_transcript", text: "move this" }, 2100);
    // no timestamps -> falls back to partial word times, now final
    expect(c.words.map((w) => w.start)).toEqual(p.words.map((w) => w.start));
    expect(c.words.every((w) => w.final)).toBe(true);
    // timestamps for the same segment then replace in place under the same key
    const [d] = a.handle({
      message_type: "committed_transcript_with_timestamps",
      text: "move this",
      words: [
        { text: "move", start: 1, end: 1.2, type: "word" },
        { text: "this", start: 1.3, end: 1.5, type: "word" },
      ],
    });
    expect(d.key).toBe(c.key);
    expect(d.words[1].start).toBe(1300);
  });

  it("missing timestamps, no audio start, or garbage numbers all fall back to estimates", () => {
    const clock = createManualClock();
    const cases = [
      createScribeAdapter({ clock }), // no audio start
      createScribeAdapter({ clock, audioStartMs: 0 }),
    ];
    const msgs = [
      { message_type: "committed_transcript_with_timestamps", text: "put that there", words: [{ text: "put", start: 0, end: 0.1, type: "word" }] },
      { message_type: "committed_transcript_with_timestamps", text: "put that there", words: [{ text: "put", type: "word" }] },
      { message_type: "committed_transcript_with_timestamps", text: "put that there" },
    ];
    for (const [i, a] of cases.entries()) {
      for (const m of msgs) {
        if (i === 1 && m.words?.length === 1 && (m.words[0] as { end?: number }).end === 0.1) continue; // valid exact for 1 word
        const [u] = a.handle(m, 5000);
        expect(u.words.map((w) => w.text)).toEqual(["put", "that", "there"]);
        expect(u.words.every((w) => Number.isFinite(w.start) && Number.isFinite(w.end))).toBe(true);
        expect(u.words[2].end).toBeCloseTo(5000 - 80);
      }
    }
    expect(createScribeAdapter({ clock }).handle({ message_type: "session_started" })).toEqual([]);
    expect(createScribeAdapter({ clock }).handle({ message_type: "partial_transcript", text: " " })).toEqual([]);
  });
});

describe("lag estimator", () => {
  it("starts at default, converges to measured lag, ignores outliers", () => {
    const e = createLagEstimator();
    expect(e.lagMs()).toBe(DEFAULT_LAG_MS.webspeech);
    for (let i = 0; i < 30; i++) e.addSample(1000 + i * 500 + 700, 1000 + i * 500);
    e.addSample(99999, 0);
    e.addSample(0, 5000);
    expect(e.samples).toBe(30);
    expect(e.lagMs()).toBeGreaterThan(650);
    expect(e.lagMs()).toBeLessThan(710);
  });
  it("observe() aligns webspeech to scribe by text in order", () => {
    const e = createLagEstimator();
    const mk = (text: string, end: number, arrival?: number) => ({ text, start: end - 200, end, final: true, source: "scribe" as const, arrival });
    const sc = [mk("move", 1000), mk("this", 1400), mk("here", 1800)];
    const ws = [mk("Move", 0, 1500), mk("this,", 0, 1900), mk("uh", 0, 2000), mk("here", 0, 2300)];
    expect(e.observe(ws, sc)).toBe(3);
    expect(e.lagMs()).toBeGreaterThan(DEFAULT_LAG_MS.webspeech);
  });
});

describe("pointerTrack", () => {
  it("records timestamped events (incl. coalesced), keep-alive on rAF, target-change callbacks", () => {
    const clock = createManualClock(0);
    const handlers: Record<string, (e: any) => void> = {};
    let rafCb: (() => void) | null = null;
    const changes: Array<string | undefined> = [];
    const track = createPointerTrack({
      clock,
      resolver: (x) => resolver(x),
      events: {
        addEventListener: (t, f) => void (handlers[t] = f),
        removeEventListener: (t) => void delete handlers[t],
      },
      raf: (cb) => ((rafCb = cb as () => void), 1),
      caf: () => {},
      onTargetChange: (p) => changes.push(p.targetId),
    });
    track.start();
    clock.set(16);
    handlers.pointermove({
      clientX: 50,
      clientY: 5,
      timeStamp: 16,
      getCoalescedEvents: () => [
        { clientX: 10, clientY: 5, timeStamp: 8 },
        { clientX: 50, clientY: 5, timeStamp: 16 },
      ],
    });
    expect(track.ring.length).toBe(2);
    expect(track.ring.get(0).t).toBe(8);
    expect(track.ring.last()!.targetId).toBe("A");
    clock.set(100);
    rafCb!();
    expect(track.ring.last()!.t).toBe(100); // held position
    expect(track.ring.last()!.x).toBe(50);
    handlers.pointermove({ clientX: 250, clientY: 5, timeStamp: 110 });
    expect(changes).toEqual(["A", "B"]);
    track.stop();
    expect(handlers.pointermove).toBeUndefined();
    expect(track.running).toBe(false);
  });
  it("retains ~15 s at 120 Hz", () => {
    const clock = createManualClock(0);
    const track = createPointerTrack({ clock });
    for (let t = 0; t < 20_000; t += 8) track.ingest(t % 300, 0, t);
    expect(track.ring.first()!.t).toBeGreaterThanOrEqual(20_000 - 8 - 15_000 - 1);
    expect(track.ring.length).toBeGreaterThan(1800);
  });
});

describe("frameTrack", () => {
  it("snapshots rect+label, optional crop, never throws", () => {
    const clock = createManualClock(0);
    const ft = createFrameTrack({
      clock,
      rectOf: (id) => (id === "boom" ? (() => { throw new Error("x"); })() : { x: 1, y: 2, w: 3, h: 4 }),
      cropper: (r) => `crop:${r.w}x${r.h}`,
    });
    ft.capture({ targetId: "A", label: "Alpha" }, 100);
    ft.capture({ targetId: "B", label: "Bravo" }, 300);
    ft.capture({ targetId: "boom" }, 400);
    expect(ft.ring.get(0).ref).toMatchObject({ label: "Alpha", rect: { w: 3 }, crop: "crop:3x4" });
    expect(ft.ring.get(2).ref.rect).toBeUndefined();
    expect(ft.at(290)!.ref.targetId).toBe("B");
    expect(ft.at(1000, 100)).toBeUndefined();
    expect(ft.forTarget("A", 350)!.t).toBe(100);
    expect(ft.forTarget("A", 50)).toBeUndefined();
  });
});

function session() {
  const clock = createManualClock(0);
  const s = createSyncSession({ clock, pointer: { resolver } });
  const got: SyncBinding[] = [];
  s.onBinding((b) => got.push(b));
  return { clock, s, got };
}

describe("createSyncSession end-to-end (synthetic)", () => {
  it("steady hover + injected word binds with frame", () => {
    const { clock, s, got } = session();
    for (let t = 0; t <= 2000; t += 8) s.pointer.ingest(50, 5, t);
    clock.set(2000);
    s.feedWords("u1", [{ text: "this", start: 1000, end: 1200, final: true, source: "injected" }]);
    expect(got).toHaveLength(1);
    expect(got[0].target?.targetId).toBe("A");
    expect(got[0].frame?.ref.label).toBe("Alpha");
    expect(got[0].final).toBe(true);
    // idempotent: resolving again emits nothing new
    s.resolve();
    expect(got).toHaveLength(1);
  });

  it("two deictics 'move this here' from Scribe commit with audio offset", () => {
    const { clock, s, got } = session();
    // A until 11300, jump to C, C after
    for (let t = 10_000; t <= 14_000; t += 8) s.pointer.ingest(t < 11_300 ? 50 : t < 11_360 ? 250 : 450, 5, t);
    clock.set(14_000);
    s.setAudioStart(10_000);
    s.feedScribe({
      message_type: "committed_transcript_with_timestamps",
      text: "Move this here",
      words: [
        { text: "Move", start: 0.5, end: 0.8, type: "word" },
        { text: "this", start: 1.0, end: 1.2, type: "word" },
        { text: "here", start: 2.5, end: 2.8, type: "word" },
      ],
    });
    const ids = got.map((b) => b.target?.targetId);
    expect(ids).toEqual(["A", "C"]);
  });

  it("late webspeech interim is lag-corrected, then final scribe exact timing supersedes + calibrates lag", () => {
    const { clock, s, got } = session();
    // pointer: A until 1000, then B 1060.., C from 1460
    for (let t = 0; t <= 4000; t += 8) {
      const x = t < 1000 ? 50 : t < 1060 ? 250 : t < 1400 ? 250 : t < 1460 ? 450 : 450;
      s.pointer.ingest(x, 5, t);
    }
    clock.set(1560);
    // user said "this" 1100-1300 on B; webspeech delivers at 1750
    s.feedWebSpeech("r0", "this", false, 1750);
    expect(got.at(-1)!.target?.targetId).toBe("B");
    expect(got.at(-1)!.final).toBe(false);
    // scribe then commits exact timing; webspeech arrival 1750 vs true end 1300 -> 450 lag sample
    s.setAudioStart(0);
    clock.set(2000);
    s.feedScribe({
      message_type: "committed_transcript_with_timestamps",
      text: "this",
      words: [{ text: "this", start: 1.1, end: 1.3, type: "word" }],
    });
    expect(got.at(-1)!.final).toBe(true);
    expect(got.at(-1)!.target?.targetId).toBe("B");
    expect(s.lag.samples).toBe(1);
  });

  it("missing timestamps from Scribe: estimated binding still lands near the right target", () => {
    const { clock, s, got } = session();
    for (let t = 0; t <= 3000; t += 8) s.pointer.ingest(t < 1500 ? 50 : 450, 5, t);
    clock.set(3000);
    // arrives at 1700ms (commit); words estimated to end at ~1620 -> "that" ends C-side? "that" is last word
    s.feedScribe({ message_type: "committed_transcript", text: "open that" }, 1700);
    expect(got.at(-1)!.word.text).toBe("that");
    expect(["A", "C"]).toContain(got.at(-1)!.target?.targetId);
    expect(s.snapshot().words).toHaveLength(2);
  });

  it("snapshot exposes buffers; start/stop are safe without DOM; unsubscribe works", () => {
    const { clock, s, got } = session();
    const off = s.onBinding(() => {});
    off();
    clock.set(10);
    s.start();
    s.stop();
    s.pointer.ingest(10, 10, 5);
    s.feedWords("u", [{ text: "it", start: 4, end: 9, final: true, source: "injected" }]);
    const snap = s.snapshot();
    expect(snap.pointers).toHaveLength(1);
    expect(snap.bindings).toHaveLength(1);
    expect(snap.webspeechLagMs).toBe(DEFAULT_LAG_MS.webspeech);
    expect(got).toHaveLength(1);
  });

  it("stress: 1000 words over a 15 s window resolve quickly", () => {
    const { clock, s } = session();
    for (let t = 0; t < 15_000; t += 8) s.pointer.ingest(((Math.floor(t / 1500) % 3) * 200) + 50, 5, t);
    clock.set(15_000);
    const words = Array.from({ length: 1000 }, (_, i) => ({ text: i % 3 ? "x" : "this", start: 5 + i * 14, end: 10 + i * 14, final: true, source: "injected" as const }));
    const t0 = performance.now();
    s.feedWords("big", words);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
