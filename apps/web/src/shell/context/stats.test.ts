import { describe, expect, it } from "vitest";
import type { Node, Screen } from "@create/shared";
import { contextStats } from "./stats";
import type { LiftEntry } from "../thread/runs";

const data = (id: string): Node => ({ id, type: "data", label: "Weather", source: { route: "/weather" } }) as unknown as Node;
const screen = (children: Node[]): Screen => ({ title: "t", children }) as unknown as Screen;
const lift = (sourceTitle: string | null): LiftEntry => ({ id: sourceTitle ?? "x", afterCount: 0, title: "t", url: "u", rows: 1, columns: [], sourceTitle, ms: 1, steps: [] });

describe("contextStats", () => {
  it("is all zero for an empty chat", () => {
    expect(contextStats({ history: [], screen: null })).toEqual({ edited: 0, rowsReceived: 0, dataSources: 0, forms: 0, imports: [] });
  });
  it("counts element edits and the sections a refinement touched", () => {
    const s = contextStats({
      history: [
        { prompt: "a", summary: "", kind: "page", result: { title: "Built page", meta: "", rows: [{ label: "x", stat: "3 elements" }] } },
        { prompt: "b", summary: "", kind: "element", label: "Heading" },
        { prompt: "c", summary: "", kind: "page", result: { title: "Updated page", meta: "", rows: [{ label: "a", stat: "changed" }, { label: "b", stat: "added" }, { label: "Live data sources", stat: "+1" }] } },
      ],
      screen: null,
    });
    expect(s.edited).toBe(3);
  });
  it("counts live data on the page and distinct import sources", () => {
    const s = contextStats({ history: [], screen: screen([data("d1"), data("d2")]), lifts: [lift("metro.example"), lift("metro.example"), lift(null), lift("other")], rowsReceived: 7 });
    expect(s.dataSources).toBe(2);
    expect(s.imports).toEqual(["metro.example", "other"]);
    expect(s.rowsReceived).toBe(7);
  });
});
