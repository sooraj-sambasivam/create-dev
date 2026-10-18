import { describe, expect, it } from "vitest";
import {
  MIN_PAGE_H,
  PAGE_W,
  builtGroupsFromShapes,
  groupReducer,
  initialGroupState,
  pageCameraOptions,
  pageHeightFor,
  popoverPosition,
  regionFromBounds,
  sectionLines,
  unionBounds,
} from "./groups";

describe("regionFromBounds", () => {
  it("unions boxes and rounds to page units", () => {
    expect(regionFromBounds([{ x: 100.4, y: 50.6, w: 100, h: 40 }, { x: 300, y: 200, w: 50.2, h: 10 }])).toEqual({ x: 100, y: 51, w: 250, h: 159 });
  });
  it("returns null for no shapes", () => {
    expect(regionFromBounds([])).toBeNull();
  });
  it("clamps to the page width and top", () => {
    expect(regionFromBounds([{ x: -40, y: -10, w: 100, h: 50 }])).toEqual({ x: 0, y: 0, w: 60, h: 40 });
    const r = regionFromBounds([{ x: 1100, y: 10, w: 400, h: 20 }])!;
    expect(r.x + r.w).toBe(PAGE_W);
  });
  it("never yields a zero-size region", () => {
    const r = regionFromBounds([{ x: 10, y: 10, w: 0, h: 0 }])!;
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });
  it("unionBounds is null when empty", () => expect(unionBounds([])).toBeNull());
});

describe("page geometry", () => {
  it("has a minimum height and grows in 600 steps as ink goes lower", () => {
    expect(pageHeightFor(0)).toBe(MIN_PAGE_H);
    expect(pageHeightFor(5000)).toBe(6000);
    expect(pageHeightFor(5000) % 600).toBe(0);
  });
  it("draws section lines every 600 units", () => {
    expect(sectionLines(1800)).toEqual([600, 1200]);
  });
  it("locks zoom and horizontal pan", () => {
    const o = pageCameraOptions(2400);
    expect(o.zoomSteps).toEqual([1]);
    expect(o.wheelBehavior).toBe("pan");
    expect(o.constraints.bounds).toEqual({ x: 0, y: 0, w: 1200, h: 2400 });
    expect(o.constraints.behavior.x).toBe("fixed");
  });
});

describe("stroke grouping", () => {
  it("collects strokes into one open group and closes it on confirm", () => {
    let s = groupReducer(initialGroupState, { type: "stroke", id: "a" });
    s = groupReducer(s, { type: "stroke", id: "b" });
    s = groupReducer(s, { type: "stroke", id: "b" });
    expect(s.open).toEqual(["a", "b"]);
    s = groupReducer(s, { type: "confirm", groupId: "g1", label: "hero" });
    expect(s.open).toEqual([]);
    expect(s.built).toEqual([{ id: "g1", label: "hero", ids: ["a", "b"] }]);
  });
  it("starts a fresh group after each confirm", () => {
    let s = groupReducer(initialGroupState, { type: "stroke", id: "a" });
    s = groupReducer(s, { type: "confirm", groupId: "g1", label: "one" });
    s = groupReducer(s, { type: "stroke", id: "c" });
    s = groupReducer(s, { type: "confirm", groupId: "g2", label: "two" });
    expect(s.built.map((g) => g.ids)).toEqual([["a"], ["c"]]);
  });
  it("confirm with no strokes is a no-op; removing strokes shrinks groups", () => {
    expect(groupReducer(initialGroupState, { type: "confirm", groupId: "g", label: "x" })).toBe(initialGroupState);
    let s = groupReducer(initialGroupState, { type: "stroke", id: "a" });
    s = groupReducer(s, { type: "remove", id: "a" });
    expect(s.open).toEqual([]);
  });
  it("hydrates built groups from shape meta", () => {
    const g = builtGroupsFromShapes([
      { id: "a", meta: { builtGroup: "g1", builtLabel: "nav" } },
      { id: "b", meta: { builtGroup: "g1", builtLabel: "nav" } },
      { id: "c", meta: {} },
    ]);
    expect(g).toEqual([{ id: "g1", label: "nav", ids: ["a", "b"] }]);
  });
});

describe("popoverPosition", () => {
  it("sits under the group", () => {
    expect(popoverPosition({ x: 100, y: 100, w: 50, h: 50 }, 800, 600)).toEqual({ left: 100, top: 160 });
  });
  it("flips above near the bottom and stays inside", () => {
    const p = popoverPosition({ x: 780, y: 520, w: 10, h: 40 }, 800, 600);
    expect(p.top).toBeLessThan(520);
    expect(p.left + 296).toBeLessThanOrEqual(792);
  });
});

import { clampCameraY, topInsetUnits, TOP_INSET_PX, fitZoom, penColorFor } from "./groups";

describe("page camera clamp", () => {
  it("stops scrolling up exactly at the initial top position", () => {
    expect(clampCameraY(124, 100, 1800, 700)).toBe(100);
    expect(clampCameraY(100, 100, 1800, 700)).toBe(100);
    expect(clampCameraY(-50, 100, 1800, 700)).toBe(-50);
  });
  it("stops scrolling down at the page bottom", () => {
    expect(clampCameraY(-5000, 100, 1800, 700)).toBe(-1100);
  });
  it("camera options leave no vertical padding and start the bounds above the page", () => {
    const c = pageCameraOptions(1800, 100).constraints;
    expect(c.padding.y).toBe(0);
    expect(c.bounds.y).toBe(-100);
    expect(c.bounds.h).toBe(1900);
  });
  it("converts the toolbar inset to page units", () => {
    expect(topInsetUnits(1200 + 48)).toBe(TOP_INSET_PX);
    expect(topInsetUnits(648)).toBe(Math.ceil(TOP_INSET_PX / fitZoom(648)));
  });
  it("uses a brighter pen in dark", () => {
    expect(penColorFor("light")).toBe("blue");
    expect(penColorFor("dark")).toBe("light-blue");
  });
});
