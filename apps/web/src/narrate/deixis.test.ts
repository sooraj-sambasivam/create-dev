import { describe, expect, it } from "vitest";
import type { SyncBinding } from "../sync";
import { annotateTranscript, boundTargets, distinctTargets, pickUtterance, requestFromBound, utteranceKey } from "./deixis";

const b = (id: string, text: string, start: number, target: string | null, final = true): SyncBinding => ({
  id,
  final,
  word: { text, start, end: start + 200, final, source: "scribe" },
  t: start,
  target: target ? { targetId: target, label: `box: ${target}`, x: 0, y: 0 } : null,
  confidence: target ? 0.9 : 0,
  mode: target ? "dwell" : "none",
});

describe("pickUtterance", () => {
  const all = [b("scribe:c0:1", "this", 1000, "A"), b("scribe:c1:1", "this", 5000, "B"), b("scribe:c1:3", "here", 5600, "C")];
  it("takes every pending utterance at or after since, in spoken order (a paused line is several commits)", () => {
    expect(pickUtterance(all, 0).map((x) => x.id)).toEqual(["scribe:c0:1", "scribe:c1:1", "scribe:c1:3"]);
    expect(pickUtterance(all, 2000).map((x) => x.id)).toEqual(["scribe:c1:1", "scribe:c1:3"]);
  });
  it("skips consumed utterances and ones before since", () => {
    expect(pickUtterance(all, 0, new Set(["scribe:c1"])).map((x) => x.id)).toEqual(["scribe:c0:1"]);
    expect(pickUtterance(all, 6000, new Set())).toEqual([]);
  });
  it("keys an utterance by its id minus the word index", () => {
    expect(utteranceKey({ id: "ws:3:0:7" })).toBe("ws:3:0");
  });
});

describe("bound targets", () => {
  it("keeps only words that landed on a node, in order, and dedupes targets", () => {
    const bs = [b("k:1", "this", 10, "A"), b("k:2", "that", 20, null), b("k:3", "here", 30, "A"), b("k:4", "it", 40, "B")];
    const bound = boundTargets(bs, (id) => `label ${id}`);
    expect(bound.map((x) => x.targetId)).toEqual(["A", "A", "B"]);
    expect(distinctTargets(bound).map((x) => x.targetId)).toEqual(["A", "B"]);
  });
});

describe("annotateTranscript", () => {
  it("names each deictic by its own target when they differ", () => {
    const bs = [b("k:1", "this", 10, "A"), b("k:3", "here,", 30, "B")];
    const out = annotateTranscript("Move this over here, please", bs, (x) => `Node ${x.target?.targetId}`);
    expect(out).toBe("Move this (Node A) over here (Node B), please");
  });
  it("leaves the text alone for one target or a misaligned transcript", () => {
    const same = [b("k:1", "this", 10, "A"), b("k:3", "here", 30, "A")];
    expect(annotateTranscript("Move this here", same, () => "x")).toBe("Move this here");
    const diff = [b("k:1", "that", 10, "A"), b("k:3", "here", 30, "B")];
    expect(annotateTranscript("Move this here", diff, () => "x")).toBe("Move this here");
  });
});

describe("requestFromBound", () => {
  it("makes the first target the pointer and lists each distinct target once", () => {
    const bound = boundTargets([b("k:1", "this", 10, "A"), b("k:2", "here", 30, "B"), b("k:3", "it", 40, "A")], (id) => `n ${id}`);
    const req = requestFromBound(" Move this here ", bound);
    expect(req?.transcript).toBe("Move this here");
    expect(req?.candidates.map((c) => c.id)).toEqual(["A", "B"]);
    expect(req?.pointer).toEqual({ targetId: "A", label: "n A" });
  });
  it("is null with nothing bound", () => {
    expect(requestFromBound("hello", [])).toBeNull();
  });
});
