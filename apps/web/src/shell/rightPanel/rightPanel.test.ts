import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { innerWidth: 1600 }, configurable: true });
  return storage;
});

import {
  RIGHT_PANEL_STORAGE_KEY,
  RIGHT_PANEL_TABS,
  clampRightPanelWidth,
  defaultRightPanelWidth,
  maxRightPanelWidth,
  selectOutputOpen,
  useRightPanel,
} from "./rightPanelStore";
import { dragWidth } from "./ResizeHandle";

const rp = () => useRightPanel.getState();

beforeEach(() => {
  memory.clear();
  useRightPanel.setState({ open: false, tab: "output", width: 800, dragging: false });
});

describe("width", () => {
  it("max is 70vw, never below 420; default is 50vw within min..max", () => {
    expect(maxRightPanelWidth(1920)).toBe(1344);
    expect(maxRightPanelWidth(500)).toBe(420);
    expect(defaultRightPanelWidth(1600)).toBe(800);
    expect(defaultRightPanelWidth(600)).toBe(420);
    expect(useRightPanel.getState().width).toBe(800);
  });
  it("clamps, resets to half the viewport and persists", () => {
    rp().setWidth(100);
    expect(rp().width).toBe(420);
    rp().setWidth(99999);
    expect(rp().width).toBe(1120);
    rp().setWidth(500);
    expect(JSON.parse(memory.getItem(RIGHT_PANEL_STORAGE_KEY)!).state).toEqual({ open: false, tab: "output", width: 500 });
    rp().reset();
    expect(rp().width).toBe(800);
    expect(clampRightPanelWidth(Number.NaN, 1600)).toBe(800);
  });
  it("does not persist the dragging flag", () => {
    rp().setDragging(true);
    rp().setWidth(450);
    expect(JSON.parse(memory.getItem(RIGHT_PANEL_STORAGE_KEY)!).state).not.toHaveProperty("dragging");
  });
});

describe("tabs", () => {
  it("are ordered Output, Inspect, Backend", () => {
    expect([...RIGHT_PANEL_TABS]).toEqual(["output", "inspect", "backend"]);
  });
});

describe("header toggle", () => {
  it("opens on Output and closes from any tab", () => {
    rp().toggleOutput();
    expect([rp().open, rp().tab, selectOutputOpen(rp())]).toEqual([true, "output", true]);
    rp().toggleOutput();
    expect(rp().open).toBe(false);
    rp().openTab("backend");
    expect(selectOutputOpen(rp())).toBe(true);
    rp().toggleOutput();
    expect(rp().open).toBe(false);
  });
});

describe("auto open", () => {
  it("showOutput opens on Output from closed or another tab and keeps the width", () => {
    rp().setWidth(600);
    rp().showOutput();
    expect([rp().open, rp().tab, rp().width]).toEqual([true, "output", 600]);
    rp().openTab("backend");
    rp().showOutput();
    expect([rp().open, rp().tab]).toEqual([true, "output"]);
  });
});

describe("leaving edit mode", () => {
  it("falls back from Inspect to Output and keeps the panel open", () => {
    rp().openTab("inspect");
    rp().editModeOff();
    expect([rp().open, rp().tab]).toEqual([true, "output"]);
  });
  it("does nothing on other tabs", () => {
    rp().openTab("backend");
    rp().editModeOff();
    expect([rp().open, rp().tab]).toEqual([true, "backend"]);
  });
});

describe("rehydrate", () => {
  it("drops bad stored values", async () => {
    memory.setItem(RIGHT_PANEL_STORAGE_KEY, JSON.stringify({ version: 2, state: { open: true, tab: "nope", width: 99999 } }));
    await useRightPanel.persist.rehydrate();
    expect(rp().open).toBe(true);
    expect(rp().tab).toBe("output");
    expect(rp().width).toBe(maxRightPanelWidth());
  });
});

describe("rehydrate from v1", () => {
  it("drops the old 400px default so the half-viewport default applies", async () => {
    memory.setItem(RIGHT_PANEL_STORAGE_KEY, JSON.stringify({ version: 1, state: { open: true, tab: "backend", width: 400 } }));
    await useRightPanel.persist.rehydrate();
    expect([rp().open, rp().tab, rp().width]).toEqual([true, "backend", 800]);
  });
});

describe("dragWidth", () => {
  it("follows the pointer, widening when dragged left", () => {
    let r = dragWidth({ x: 100, w: 400, target: 400 }, 400, 40);
    expect(r.width).toBe(460);
    r = dragWidth(r.anchor, 460, 70);
    expect(r.width).toBe(430);
  });
  it("re-anchors on the rendered width when the layout caps the panel", () => {
    let r = dragWidth({ x: 100, w: 400, target: 400 }, 400, 0);
    expect(r.width).toBe(500);
    r = dragWidth(r.anchor, 450, 30);
    expect(r.width).toBe(450);
    r = dragWidth(r.anchor, 450, 50);
    expect(r.width).toBe(430);
  });
});
