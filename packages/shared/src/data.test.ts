import { describe, expect, it } from "vitest";
import { DataSchema, NodeSchema, sanitizeNodes, sanitizeScreen, ScreenSchema } from "./index";

const base = { id: "d1", type: "data", source: { route: "/orders/today" }, field: "total" };

describe("DataSchema", () => {
  it("fills defaults", () => {
    const n = DataSchema.parse(base);
    expect(n.format).toBe("text");
    expect(n.fallback).toBe("—");
    expect(n.refreshSec).toBeUndefined();
  });
  it("rejects routes that are not paths", () => {
    expect(DataSchema.safeParse({ ...base, source: { route: "orders" } }).success).toBe(false);
    expect(DataSchema.safeParse({ ...base, source: { route: "https://x.com/a" } }).success).toBe(false);
  });
  it("bounds refreshSec", () => {
    expect(DataSchema.safeParse({ ...base, refreshSec: 4 }).success).toBe(false);
    expect(DataSchema.safeParse({ ...base, refreshSec: 3601 }).success).toBe(false);
    expect(DataSchema.safeParse({ ...base, refreshSec: 5 }).success).toBe(true);
    expect(DataSchema.safeParse({ ...base, refreshSec: 3600 }).success).toBe(true);
  });
  it("round-trips through NodeSchema", () => {
    const full = { ...base, format: "currency", label: "Sales", fallback: "n/a", refreshSec: 30, source: { route: "/a", params: { d: "1" } } };
    const parsed = NodeSchema.parse(full);
    expect(NodeSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});

describe("sanitize data nodes", () => {
  const tree = [{ id: "box", type: "container", children: [base, { id: "t", type: "text", text: "hi" }] }];
  it("drops data nodes when the route list is empty", () => {
    const notes: string[] = [];
    const out = sanitizeNodes(tree, notes, new Set(), []) as { children: unknown[] }[];
    expect(out[0].children).toHaveLength(1);
    expect(notes.length).toBe(1);
  });
  it("keeps data nodes when no route list is passed (refine callers)", () => {
    const out = sanitizeNodes(tree) as { children: unknown[] }[];
    expect(out[0].children).toHaveLength(2);
  });
  it("drops data nodes with unknown routes", () => {
    const out = sanitizeNodes(tree, [], new Set(), ["/other"]) as { children: unknown[] }[];
    expect(out[0].children).toHaveLength(1);
  });
  it("keeps allowed routes (trailing slash and query ignored) and clamps refresh", () => {
    const t = [{ ...base, refreshSec: 1, source: { route: "/orders/today/", params: { n: 3 } } }];
    const out = sanitizeNodes(t, [], new Set(), ["/orders/today?x=1"]);
    expect(out).toHaveLength(1);
    expect(out[0].refreshSec).toBe(5);
    expect(out[0].source).toEqual({ route: "/orders/today/", params: { n: "3" } });
    expect(NodeSchema.safeParse(out[0]).success).toBe(true);
  });
  it("sanitizeScreen threads routes", () => {
    const screen = { title: "t", children: [base] };
    expect(ScreenSchema.parse(sanitizeScreen(screen, [], [])).children).toHaveLength(0);
    expect(ScreenSchema.parse(sanitizeScreen(screen)).children).toHaveLength(1);
    expect(ScreenSchema.parse(sanitizeScreen(screen, [], ["/orders/today"])).children).toHaveLength(1);
  });
});
