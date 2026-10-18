import { describe, expect, it } from "vitest";
import type { Node, Screen } from "@create/shared";
import { StepTracker, analyzeScreen, askSteps, buildResult, countElements, editResult, formatDuration, liftResult, runLabel } from "./runs";

const heading = (id: string, text = id): Node => ({ id, type: "heading", text, level: 1 }) as Node;
const image = (id: string): Node => ({ id, type: "image", src: "a.png", alt: "" }) as Node;
const box = (id: string, children: Node[]): Node => ({ id, type: "container", direction: "column", children }) as unknown as Node;
const screen = (children: Node[]): Screen => ({ title: "t", children }) as unknown as Screen;
const label = (n: Node) => n.id;

describe("durations", () => {
  it("formats seconds and minutes, never 0s", () => {
    expect(formatDuration(0)).toBe("1s");
    expect(formatDuration(400)).toBe("1s");
    expect(formatDuration(12_400)).toBe("12s");
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(64_000)).toBe("1m 4s");
    expect(formatDuration(Number.NaN)).toBe("1s");
  });
  it("builds the run line text", () => {
    expect(runLabel("build", 12_000)).toBe("Built in 12s");
    expect(runLabel("ask", 2000)).toBe("Answered in 2s");
    expect(runLabel("lift", 4000)).toBe("Lifted in 4s");
    expect(runLabel("edit", 3000)).toBe("Edited in 3s");
  });
});

describe("StepTracker", () => {
  it("starts with a planning step, or a reading step when a page exists", () => {
    expect(new StepTracker(0, false).steps[0].label).toBe("Planning layout");
    expect(new StepTracker(0, true).steps[0].label).toBe("Reading your page");
  });
  it("updates Writing N sections in place and adds one step per feature", () => {
    const t = new StepTracker(1000, false);
    expect(t.frame(screen([heading("a")]), 1500)).toBe(true);
    expect(t.frame(screen([heading("a"), heading("b")]), 2500)).toBe(true);
    expect(t.frame(screen([heading("a"), heading("b")]), 2600)).toBe(false);
    expect(t.steps.map((s) => s.label)).toEqual(["Planning layout", "Writing 2 sections"]);
    t.frame(screen([heading("a"), heading("b"), image("i")]), 3000);
    t.frame(screen([heading("a"), heading("b"), image("i"), image("j")]), 3100);
    expect(t.steps.map((s) => s.label)).toEqual(["Planning layout", "Writing 3 sections", "Picking photos", "Writing 4 sections"]);
  });
  it("records offsets and finishes with elapsed time and a copy of the steps", () => {
    const t = new StepTracker(1000, false);
    t.frame(screen([heading("a")]), 3000);
    const done = t.finish(13_000);
    expect(done.ms).toBe(12_000);
    expect(done.steps[1]).toEqual({ label: "Writing 1 section", at: 2000 });
    expect(done.steps[done.steps.length - 1]).toEqual({ label: "Finishing up", at: 12_000 });
    done.steps[0].label = "changed";
    expect(t.steps[0].label).toBe("Planning layout");
  });
  it("gives questions a two-step log", () => {
    expect(askSteps(2000, true, true).map((s) => s.label)).toEqual(["Reading the element", "Writing the answer"]);
    expect(askSteps(2000, false, false)[0].label).toBe("Reading your question");
  });
});

describe("result data", () => {
  it("counts elements through containers", () => {
    const s = screen([box("c", [heading("a"), heading("b")]), heading("d")]);
    expect(countElements(s)).toBe(4);
    expect(analyzeScreen(s).sections).toBe(2);
    expect(countElements(null)).toBe(0);
  });
  it("first build: one row per section with its element count", () => {
    const r = buildResult(null, screen([box("hero", [heading("a"), heading("b")]), heading("d")]), label);
    expect(r.title).toBe("Built page");
    expect(r.meta).toBe("4 elements");
    expect(r.rows).toEqual([{ label: "hero", stat: "3 elements" }, { label: "d", stat: "1 element" }]);
  });
  it("refinement: added, changed and removed sections", () => {
    const before = screen([heading("a", "one"), heading("b"), heading("c")]);
    const after = screen([heading("a", "ONE"), heading("b"), heading("n")]);
    const r = buildResult(before, after, label);
    expect(r.title).toBe("Updated page");
    expect(r.meta).toBe("1 added · 1 changed · 1 removed");
    expect(r.rows.map((x) => `${x.label}:${x.stat}`)).toEqual(["a:changed", "n:added", "c:removed"]);
  });
  it("refinement with no visible change says so", () => {
    const s = screen([heading("a")]);
    expect(buildResult(s, s, label).meta).toBe("No visible changes");
  });
  it("edit and lift cards", () => {
    expect(editResult("Heading · Ember", "Made it bigger.")).toEqual({ title: "Edited Heading · Ember", meta: "1 element", rows: [{ label: "Heading · Ember", stat: "Made it bigger" }] });
    const lift = liftResult({ title: "Route 44 schedule", rows: 12, columns: [{ label: "Stop", type: "text" }, { label: "Time", type: "time" }, { label: "Fare", type: "money" }, { label: "Zone", type: "text" }], sourceTitle: "metro.example" });
    expect(lift.title).toBe("Lifted Route 44 schedule");
    expect(lift.meta).toBe("12 rows · 4 columns");
    expect(lift.rows).toHaveLength(5);
    expect(lift.rows[4]).toEqual({ label: "Imported from metro.example" });
  });
});
