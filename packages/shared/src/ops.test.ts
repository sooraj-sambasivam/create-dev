import { describe, expect, it } from "vitest";
import { NodeSchema, ScreenSchema, type Node, type Screen } from "./schema";
import { applyOps, ScreenOpSchema, ScreenOpsSchema, type ScreenOp } from "./ops";
import { CanvasOpsRequestSchema, CanvasOpsResponseSchema, LiveSourceSchema } from "./integration";
import { findNode } from "./tree";

const n = (x: Record<string, unknown>): Node => NodeSchema.parse(x);
const base = (): Screen =>
  ScreenSchema.parse({
    title: "T",
    children: [
      { id: "h", type: "heading", text: "Hi" },
      { id: "box", type: "container", children: [{ id: "a", type: "text", text: "A" }, { id: "b", type: "text", text: "B" }] },
    ],
  });
const ids = (s: Screen, parent: string | null) => (parent ? (findNode(s, parent) as any).children : s.children).map((c: Node) => c.id);

describe("applyOps", () => {
  it("inserts at end, at index, and into a container", () => {
    const ops: ScreenOp[] = [
      { op: "insert", parentId: null, node: n({ id: "z", type: "badge", text: "z" }) },
      { op: "insert", parentId: null, index: 0, node: n({ id: "f", type: "badge", text: "f" }) },
      { op: "insert", parentId: "box", index: 1, node: n({ id: "m", type: "badge", text: "m" }) },
    ];
    const r = applyOps(base(), ops);
    expect(r.applied).toBe(3);
    expect(ids(r.screen, null)).toEqual(["f", "h", "box", "z"]);
    expect(ids(r.screen, "box")).toEqual(["a", "m", "b"]);
    expect(r.changedIds).toEqual(["z", "f", "m"]);
  });
  it("skips insert into unknown or non-container parent", () => {
    const r = applyOps(base(), [
      { op: "insert", parentId: "nope", node: n({ id: "q", type: "divider" }) },
      { op: "insert", parentId: "h", node: n({ id: "q", type: "divider" }) },
    ]);
    expect(r.applied).toBe(0);
    expect(r.skipped.map((s) => s.index)).toEqual([0, 1]);
  });
  it("replaces one node with several", () => {
    const r = applyOps(base(), [{ op: "replace", targetId: "a", nodes: [n({ id: "x", type: "badge", text: "x" }), n({ id: "y", type: "badge", text: "y" })] }]);
    expect(ids(r.screen, "box")).toEqual(["x", "y", "b"]);
    expect(r.changedIds).toEqual(["x", "y"]);
  });
  it("removes a node", () => {
    const r = applyOps(base(), [{ op: "remove", targetId: "box" }]);
    expect(ids(r.screen, null)).toEqual(["h"]);
    expect(r.changedIds).toEqual(["box"]);
  });
  it("merges style", () => {
    const r1 = applyOps(base(), [
      { op: "style", targetId: "h", style: { color: "#ff0000" } },
      { op: "style", targetId: "h", style: { weight: "bold" } },
    ]);
    expect(findNode(r1.screen, "h")!.style).toEqual({ color: "#ff0000", weight: "bold" });
  });
  it("update patches fields but cannot change id, type or children", () => {
    const r = applyOps(base(), [
      { op: "update", targetId: "box", patch: { id: "evil", type: "text", children: [], gap: "lg" } },
      { op: "update", targetId: "h", patch: { text: "Yo", level: 1 } },
    ]);
    const box = findNode(r.screen, "box")!;
    expect(box.id).toBe("box");
    expect(box.type).toBe("container");
    expect(ids(r.screen, "box")).toEqual(["a", "b"]);
    expect((box as any).gap).toBe("lg");
    expect(findNode(r.screen, "h")).toMatchObject({ text: "Yo", level: 1 });
    expect(r.applied).toBe(2);
  });
  it("skips an update that makes the node invalid", () => {
    const r = applyOps(base(), [{ op: "update", targetId: "h", patch: { level: 9 } }]);
    expect(r.applied).toBe(0);
    expect(r.skipped[0]!.reason).toContain("invalid patch");
  });
  it("applies page op", () => {
    const r = applyOps(base(), [{ op: "page", title: "New", theme: "dark", accent: "#16a34a", font: "serif" }]);
    expect(r.screen).toMatchObject({ title: "New", theme: "dark", accent: "#16a34a", font: "serif" });
    const r2 = applyOps(r.screen, [{ op: "page", title: "Only" }]);
    expect(r2.screen).toMatchObject({ title: "Only", theme: "dark", font: "serif" });
  });
  it("skips unknown targets with a reason and keeps going", () => {
    const r = applyOps(base(), [
      { op: "remove", targetId: "ghost" },
      { op: "replace", targetId: "ghost", nodes: [n({ id: "q", type: "divider" })] },
      { op: "style", targetId: "ghost", style: {} },
      { op: "update", targetId: "ghost", patch: {} },
      { op: "remove", targetId: "h" },
    ]);
    expect(r.applied).toBe(1);
    expect(r.skipped).toHaveLength(4);
    expect(r.skipped[0]!.reason).toContain("ghost");
  });
  it("makes duplicate ids unique, including inside inserted subtrees", () => {
    const sub = n({ id: "h", type: "container", children: [{ id: "a", type: "text", text: "dup" }, { id: "a", type: "text", text: "dup2" }] });
    const r = applyOps(base(), [{ op: "insert", parentId: null, node: sub }]);
    const all: string[] = [];
    const walk = (list: Node[]) => list.forEach((x) => { all.push(x.id); if (x.type === "container") walk(x.children); });
    walk(r.screen.children);
    expect(new Set(all).size).toBe(all.length);
    expect(r.changedIds[0]).not.toBe("h");
  });
  it("starts from an empty screen when null", () => {
    const r = applyOps(null, [{ op: "insert", parentId: null, node: n({ id: "h", type: "heading", text: "x" }) }, { op: "page", title: "Made" }]);
    expect(r.screen.title).toBe("Made");
    expect(r.screen.children).toHaveLength(1);
    expect(ScreenSchema.safeParse(r.screen).success).toBe(true);
    expect(applyOps(null, []).screen.title.length).toBeGreaterThan(0);
  });
  it("does not mutate the input", () => {
    const s = base();
    const copy = JSON.stringify(s);
    applyOps(s, [{ op: "remove", targetId: "h" }]);
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe("schemas", () => {
  it("validates ops", () => {
    expect(ScreenOpSchema.safeParse({ op: "remove", targetId: "x" }).success).toBe(true);
    expect(ScreenOpSchema.safeParse({ op: "bogus" }).success).toBe(false);
    expect(ScreenOpSchema.safeParse({ op: "replace", targetId: "x", nodes: [] }).success).toBe(false);
    expect(ScreenOpSchema.safeParse({ op: "insert", parentId: null, index: -1, node: { id: "a", type: "divider" } }).success).toBe(false);
    expect(ScreenOpsSchema.safeParse(Array(41).fill({ op: "remove", targetId: "x" })).success).toBe(false);
  });
  it("validates canvas ops request/response and live sources", () => {
    const req = { image: "data:image/png;base64,AAAA", label: "hero", region: { y: 0, h: 400 }, shapes: [], screen: null };
    expect(CanvasOpsRequestSchema.safeParse(req).success).toBe(true);
    expect(CanvasOpsRequestSchema.safeParse({ ...req, label: "x".repeat(501) }).success).toBe(false);
    expect(CanvasOpsResponseSchema.safeParse({ summary: "s", ops: [], provider: "mock" }).success).toBe(true);
    expect(LiveSourceSchema.safeParse({ id: "weather", params: { city: "Seattle" } }).success).toBe(true);
    expect(LiveSourceSchema.safeParse({ id: "nope", params: {} }).success).toBe(false);
  });
});
