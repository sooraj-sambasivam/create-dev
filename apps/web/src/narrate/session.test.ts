import { describe, expect, it } from "vitest";
import { createRecorder } from "./session";

describe("createRecorder", () => {
  it("stamps events with ms since start using the injected clock", () => {
    let now = 1_000;
    const rec = createRecorder("canvas", () => now);
    now = 1_250;
    rec.add({ kind: "speech", text: "make this blue", final: true });
    now = 4_000;
    rec.add({ kind: "note", text: "pause" });
    expect(rec.session.startedAt).toBe(1_000);
    expect(rec.session.context).toBe("canvas");
    expect(rec.session.events).toEqual([
      { t: 250, kind: "speech", text: "make this blue", final: true },
      { t: 3_000, kind: "note", text: "pause" },
    ]);
  });

  it("keeps the same live session object and clamps negative elapsed time", () => {
    let now = 500;
    const rec = createRecorder("page", () => now);
    now = 100;
    rec.add({ kind: "note", text: "clock went backwards" });
    expect(rec.session.events[0].t).toBe(0);
    expect(rec.finish()).toBe(rec.session);
  });

  it("records lasso targets with their kind", () => {
    const rec = createRecorder("page", () => 0);
    rec.add({
      kind: "lasso",
      rect: { x: 1, y: 2, w: 3, h: 4 },
      targets: [{ id: "n1", label: "Hero", kind: "node" }],
    });
    expect(rec.session.events[0]).toMatchObject({ kind: "lasso", targets: [{ id: "n1", kind: "node" }] });
  });

  it("records snapshots oldest first and ignores empty data", () => {
    const rec = createRecorder("canvas", () => 0);
    rec.snapshot("data:image/png;base64,AAA");
    rec.snapshot("");
    rec.snapshot("data:image/png;base64,BBB");
    expect(rec.session.snapshots).toEqual(["data:image/png;base64,AAA", "data:image/png;base64,BBB"]);
  });

  it("sets endedAt on finish and ignores later adds", () => {
    let now = 0;
    const rec = createRecorder("page", () => now);
    now = 700;
    rec.add({ kind: "note", text: "before" });
    now = 900;
    const done = rec.finish();
    expect(done.endedAt).toBe(900);
    now = 1_500;
    rec.add({ kind: "note", text: "after" });
    rec.snapshot("data:image/png;base64,CCC");
    rec.finish();
    expect(done.endedAt).toBe(900);
    expect(done.events.map((e) => e.kind === "note" && e.text)).toEqual(["before"]);
    expect(done.snapshots).toEqual([]);
  });

  it("gives each session a non-empty id", () => {
    const a = createRecorder("page", () => 0);
    const b = createRecorder("page", () => 0);
    expect(a.session.id.length).toBeGreaterThan(0);
    expect(a.session.id).not.toBe(b.session.id);
  });
});
