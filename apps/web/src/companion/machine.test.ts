import { describe, expect, it } from "vitest";
import { DURATIONS, MAX_NOTES, activeByEvents, initialState, nextWake, reduce } from "./machine";

const run = (evts: Array<[Parameters<typeof reduce>[1], number]>) =>
  evts.reduce((s, [e, t]) => reduce(s, e, t), initialState);

describe("machine", () => {
  it("listens, hears, then falls back to listening and idle by timers", () => {
    let s = run([[{ type: "listening" }, 0], [{ type: "interim", text: "make it bigger" }, 100]]);
    expect(s.face).toBe("hearing");
    expect(s.nod).toBe(1);
    s = reduce(s, { type: "tick" }, 100 + DURATIONS.hearing);
    expect(s.face).toBe("listening");
    s = reduce(s, { type: "tick" }, 100 + DURATIONS.hearing + DURATIONS.listening);
    expect(s.face).toBe("idle");
  });
  it("nods once per roughly three new words", () => {
    const s = run([[{ type: "interim", text: "one two" }, 0], [{ type: "interim", text: "one two three" }, 1], [{ type: "interim", text: "one two three four" }, 2]]);
    expect(s.nod).toBe(1);
  });
  it("final adds a note and shows noting", () => {
    const s = run([[{ type: "final", text: "make the heading bigger" }, 0]]);
    expect(s.face).toBe("noting");
    expect(s.notes[0]).toMatchObject({ kind: "heard", text: "make the heading bigger" });
  });
  it("thinking is not interrupted by lower states but ends on done", () => {
    let s = run([[{ type: "thinking" }, 0], [{ type: "interim", text: "a b c" }, 1], [{ type: "celebrate" }, 2]]);
    expect(s.face).toBe("thinking");
    s = reduce(s, { type: "done", text: "Made it bigger", label: "Heading" }, 3);
    expect(s.face).toBe("done");
    expect(s.notes.at(-1)).toMatchObject({ kind: "ok", text: "Heading · Made it bigger" });
  });
  it("error beats everything and expires after 4s", () => {
    let s = run([[{ type: "thinking" }, 0], [{ type: "error", text: "x".repeat(100) }, 1], [{ type: "done" }, 2]]);
    expect(s.face).toBe("error");
    expect(s.notes[0].text).toHaveLength(60);
    s = reduce(s, { type: "tick" }, 1 + DURATIONS.error);
    expect(s.face).toBe("idle");
  });
  it("confused writes a question row with candidates", () => {
    const s = run([[{ type: "confused", text: "Which one?", label: "Heading or Button" }, 0]]);
    expect(s.face).toBe("confused");
    expect(s.notes[0]).toMatchObject({ kind: "ask", text: "Which one: Heading or Button" });
  });
  it("keeps at most four notes and clears them 6s after the last", () => {
    let s = initialState;
    for (let i = 0; i < 6; i++) s = reduce(s, { type: "note", text: `n${i}` }, i);
    expect(s.notes).toHaveLength(MAX_NOTES);
    expect(s.notes.at(-1)?.text).toBe("n5");
    s = reduce(s, { type: "tick" }, 5 + DURATIONS.notes);
    expect(s.notes).toHaveLength(0);
  });
  it("level events and unknown events change nothing", () => {
    expect(reduce(initialState, { type: "level", level: 1 }, 5)).toBe(initialState);
    expect(reduce(initialState, { type: "nope" } as never, 5)).toBe(initialState);
  });
  it("hides after 20s without events and reports the next wake", () => {
    const s = run([[{ type: "listening" }, 1000]]);
    expect(activeByEvents(s)).toBe(true);
    expect(nextWake(s)).toBe(1000 + DURATIONS.listening);
    const later = reduce(s, { type: "tick" }, 1000 + DURATIONS.visible);
    expect(activeByEvents(later)).toBe(false);
  });
});
