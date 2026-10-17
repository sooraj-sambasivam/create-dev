import { describe, expect, it } from "vitest";
import type { Node, Screen } from "@create/shared";
import { buildRevealFrames, countNodes, nodeIdAt } from "./reveal";

const h = (id: string): Node => ({ id, type: "heading", text: id } as unknown as Node);
const box = (id: string, children: Node[]): Node => ({ id, type: "container", children } as unknown as Node);
const screen = (children: Node[]): Screen => ({ title: "t", theme: "light", font: "sans", children }) as Screen;

describe("buildRevealFrames", () => {
  const final = screen([box("a", [h("a1"), h("a2")]), box("b", [h("b1")]), h("c")]);

  it("counts and indexes in reading order", () => {
    expect(countNodes(final.children)).toBe(6);
    expect([0, 1, 2, 3, 4, 5].map((i) => nodeIdAt(final.children, i))).toEqual(["a", "a1", "a2", "b", "b1", "c"]);
  });

  it("grows one node at a time, section first then children", () => {
    const frames = buildRevealFrames(final);
    expect(frames).toHaveLength(6);
    expect(frames.map((f) => countNodes(f.screen.children))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(frames[0].screen.children[0]).toMatchObject({ id: "a", children: [] });
    expect(frames[1].newestId).toBe("a1");
    expect(frames[3].screen.children.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("ends with the exact final screen and keeps metadata", () => {
    const frames = buildRevealFrames(final);
    expect(frames.at(-1)!.screen).toBe(final);
    expect(frames[0].screen.title).toBe("t");
  });

  it("caps frame count", () => {
    const big = screen(Array.from({ length: 100 }, (_, i) => h(`n${i}`)));
    const frames = buildRevealFrames(big, 20);
    expect(frames.length).toBeLessThanOrEqual(20);
    expect(countNodes(frames.at(-1)!.screen.children)).toBe(100);
  });

  it("handles an empty screen", () => {
    expect(buildRevealFrames(screen([]))).toHaveLength(1);
  });
});
