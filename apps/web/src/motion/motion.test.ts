import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), clear: () => map.clear(), key: () => null, length: 0 },
  });
});

import { MOTION_PRESET_IDS, PRESETS, cssAttr, exportMotionCss, keyframesCss } from "./presets";
import { useMotionStore } from "./motionStore";

describe("presets css", () => {
  it("defines all eight presets with keyframes", () => {
    expect(MOTION_PRESET_IDS).toHaveLength(8);
    for (const p of MOTION_PRESET_IDS) expect(keyframesCss([p])).toContain(`@keyframes cd-motion-${p}`);
  });
  it("loops only for float, pulse and marquee", () => {
    expect(MOTION_PRESET_IDS.filter((p) => PRESETS[p].loop)).toEqual(["float", "pulse", "marquee"]);
  });
  it("scopes selectors and respects reduced motion", () => {
    const css = exportMotionCss({ "hero-title": "fade-in", cta: "pop" });
    expect(css.startsWith("@media (prefers-reduced-motion: no-preference)")).toBe(true);
    expect(css).toContain('[data-screen-root] [data-node-id="hero-title"]{animation:cd-motion-fade-in');
    expect(css).toContain('[data-node-id="cta"]{animation:cd-motion-pop');
  });
  it("emits each keyframe once and skips unknown presets", () => {
    const css = exportMotionCss({ a: "pulse", b: "pulse", c: "nope" });
    expect(css.match(/@keyframes cd-motion-pulse/g)).toHaveLength(1);
    expect(css).not.toContain('"c"');
  });
  it("returns empty for an empty map and escapes ids", () => {
    expect(exportMotionCss({})).toBe("");
    expect(cssAttr('a"]{x:1}')).toBe('a\\"]{x:1}');
  });
});

describe("motionStore", () => {
  beforeEach(() => useMotionStore.setState({ byChat: {} }));
  it("sets, replaces and clears per node, per chat", () => {
    const s = useMotionStore.getState();
    s.setPreset("c1", "n1", "fade-in");
    s.setPreset("c1", "n1", "zoom-in");
    s.setPreset("c2", "n1", "pop");
    expect(useMotionStore.getState().byChat).toEqual({ c1: { n1: "zoom-in" }, c2: { n1: "pop" } });
    s.setPreset("c1", "n1", null);
    expect(useMotionStore.getState().byChat).toEqual({ c2: { n1: "pop" } });
  });
  it("ignores invalid presets and clears a chat", () => {
    const s = useMotionStore.getState();
    s.setPreset("c1", "n1", "bogus" as never);
    expect(useMotionStore.getState().byChat).toEqual({});
    s.setPreset("c1", "n1", "pop");
    s.clearChat("c1");
    expect(useMotionStore.getState().byChat).toEqual({});
  });
});
