import { describe, expect, it } from "vitest";
import {
  buildIntentRequest,
  clipRect,
  collectDomPageHits,
  collectPageHits,
  frameScale,
  mapToHost,
  nodeLabel,
  overlapFraction,
  resolvePageTargets,
  type ElementLike,
  type PageFrame,
} from "./targets";

type R = { left: number; top: number; width: number; height: number };

function el(id: string, r: R, text = "", type?: string): ElementLike {
  return {
    getAttribute: (n: string) => (n === "data-node-id" ? id : n === "data-node-type" ? (type ?? null) : null),
    getBoundingClientRect: () => r,
    innerText: text,
    textContent: text,
    tagName: "DIV",
  };
}

/** A panel preview frame at host (900,100), 600x280 on screen, laid out at 1200x560 (scale 0.5). */
function previewFrame(nodes: ElementLike[]): PageFrame {
  return {
    frame: { offsetWidth: 1200, getBoundingClientRect: () => ({ left: 900, top: 100, width: 600, height: 280 }) },
    doc: { querySelectorAll: () => nodes },
  };
}

describe("targets", () => {
  it("labels nodes with type and snippet", () => {
    expect(nodeLabel("button", "  Buy   now ")).toBe("button: Buy now");
    expect(nodeLabel("image", "")).toBe("image");
    expect(nodeLabel("text", "x".repeat(100)).length).toBeLessThan(60);
  });
  it("computes overlap", () => {
    expect(overlapFraction({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 5, h: 10 })).toBe(0.5);
    expect(overlapFraction({ x: 0, y: 0, w: 0, h: 10 }, { x: 0, y: 0, w: 5, h: 10 })).toBe(0);
  });
  it("clips boxes and maps frame coordinates to the host", () => {
    expect(clipRect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({ x: 5, y: 5, w: 5, h: 5 });
    expect(clipRect({ x: 0, y: 0, w: 4, h: 4 }, { x: 5, y: 5, w: 4, h: 4 })).toBeNull();
    expect(frameScale(600, 1200)).toBe(0.5);
    expect(frameScale(0, 1200)).toBe(1);
    expect(mapToHost({ x: 10, y: 20, w: 40, h: 30 }, { x: 900, y: 100, w: 600, h: 280 }, 0.5)).toEqual({ x: 905, y: 110, w: 20, h: 15 });
  });
  it("only builds an intent request within 4s of a lasso", () => {
    const lasso = { t: 1000, targets: [{ id: "n1", label: "button", kind: "node" as const }] };
    expect(buildIntentRequest("make it red", lasso, 4900)?.candidates).toHaveLength(1);
    expect(buildIntentRequest("make it red", lasso, 5100)).toBeNull();
    expect(buildIntentRequest("make it red", null, 1100)).toBeNull();
    expect(buildIntentRequest("  ", lasso, 1100)).toBeNull();
    expect(buildIntentRequest("x", { t: 1000, targets: [] }, 1100)).toBeNull();
  });
});

describe("collectPageHits (panel page area)", () => {
  it("hits page nodes under the lasso in host coordinates", () => {
    // Node at frame-local (0,0) 200x100 is host (900,100) 100x50 at scale 0.5.
    const hits = collectPageHits(
      { x: 890, y: 90, w: 120, h: 80 },
      [previewFrame([el("n1", { left: 0, top: 0, width: 200, height: 100 }, "Buy now", "button")])],
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].target).toEqual({ id: "n1", label: "button: Buy now", kind: "node" });
    expect(hits[0].box).toEqual({ x: 900, y: 100, w: 100, h: 50 });
  });
  it("ignores nodes outside the lasso, without an id, or too small", () => {
    const hits = collectPageHits(
      { x: 0, y: 0, w: 50, h: 50 },
      [previewFrame([
        el("far", { left: 0, top: 0, width: 200, height: 100 }),
        el("tiny", { left: 0, top: 0, width: 4, height: 4 }),
      ])],
    );
    expect(hits).toHaveLength(0);
  });
  it("clips a node scrolled partly out of the panel and skips one mostly out of view", () => {
    const lasso = { x: 0, y: 0, w: 2000, h: 2000 };
    const hits = collectPageHits(lasso, [previewFrame([
      // Frame-local top -100 => host top 50; the visible part starts at the frame top (100).
      el("half", { left: 0, top: -100, width: 200, height: 200 }),
      // Mostly above the frame: visible area is under half, so no hit.
      el("gone", { left: 0, top: -400, width: 200, height: 200 }),
    ])]);
    expect(hits.map((h) => h.target.id)).toEqual(["half"]);
    expect(hits[0].box.y).toBe(100);
  });
  it("searches only the frames it is given, so no frames means no targets", () => {
    expect(collectPageHits({ x: 0, y: 0, w: 2000, h: 2000 }, [])).toEqual([]);
  });
});

/** A host document that answers the few selectors the resolver uses. Elements are viewport-positioned. */
function domNode(id: string, r: R, text = "", type?: string): ElementLike {
  return { ...el(id, r, text, type), getBoundingClientRect: () => r };
}
function fakeHost(map: Record<string, unknown[]>): Document {
  const host = {
    querySelector: (sel: string) => (map[sel] ?? [])[0] ?? null,
    querySelectorAll: (sel: string) => map[sel] ?? [],
  };
  return host as unknown as Document;
}
/** A [data-screen-root] under the panel, holding the given nodes. */
function pageRoot(r: R, nodes: ElementLike[]) {
  return { getBoundingClientRect: () => r, querySelectorAll: () => nodes };
}
const PANEL_R: R = { left: 800, top: 0, width: 400, height: 600 };

describe("collectDomPageHits (page live in the main document)", () => {
  it("hits page nodes inside the panel's Output page, in viewport pixels", () => {
    const host = fakeHost({
      "[data-right-panel]": [{ getBoundingClientRect: () => PANEL_R }],
      "[data-right-panel] [data-screen-root]": [pageRoot({ left: 800, top: 50, width: 400, height: 500 }, [
        domNode("btn", { left: 900, top: 120, width: 100, height: 40 }, "Buy now", "button"),
      ])],
    });
    const hits = collectDomPageHits({ x: 880, y: 100, w: 200, h: 100 }, host);
    expect(hits).toEqual([{ target: { id: "btn", label: "button: Buy now", kind: "node" }, box: { x: 900, y: 120, w: 100, h: 40 } }]);
  });

  it("clips a node that runs past the panel edge and skips one mostly outside it", () => {
    const host = fakeHost({
      "[data-right-panel]": [{ getBoundingClientRect: () => PANEL_R }],
      "[data-right-panel] [data-screen-root]": [pageRoot({ left: 800, top: 0, width: 400, height: 600 }, [
        // Right edge at 1230, panel ends at 1200: visible 20 of 50 wide, under half, skipped.
        domNode("gone", { left: 1180, top: 100, width: 50, height: 40 }),
        // Right edge at 1210, visible 40 of 50: kept, clipped to the panel.
        domNode("half", { left: 1160, top: 100, width: 50, height: 40 }),
      ])],
    });
    const hits = collectDomPageHits({ x: 0, y: 0, w: 2000, h: 2000 }, host);
    expect(hits.map((h) => h.target.id)).toEqual(["half"]);
    expect(hits[0].box).toEqual({ x: 1160, y: 100, w: 40, h: 40 });
  });

  it("ignores nodes outside the lasso and returns nothing without a panel or page", () => {
    const host = fakeHost({
      "[data-right-panel]": [{ getBoundingClientRect: () => PANEL_R }],
      "[data-right-panel] [data-screen-root]": [pageRoot({ left: 800, top: 0, width: 400, height: 600 }, [
        domNode("far", { left: 850, top: 500, width: 100, height: 40 }),
      ])],
    });
    expect(collectDomPageHits({ x: 0, y: 0, w: 50, h: 50 }, host)).toEqual([]);
    expect(collectDomPageHits({ x: 0, y: 0, w: 2000, h: 2000 }, fakeHost({}))).toEqual([]);
  });
});

describe("resolvePageTargets", () => {
  it("uses the live main-document page when present", () => {
    const host = fakeHost({
      "[data-right-panel]": [{ getBoundingClientRect: () => PANEL_R }],
      "[data-right-panel] [data-screen-root]": [pageRoot({ left: 800, top: 0, width: 400, height: 600 }, [
        domNode("live", { left: 900, top: 100, width: 100, height: 40 }, "Hi", "text"),
      ])],
    });
    expect(resolvePageTargets({ x: 880, y: 90, w: 200, h: 80 }, host).map((h) => h.target.id)).toEqual(["live"]);
  });

  it("falls back to a panel preview iframe only when no live page is present", () => {
    const iframe = {
      offsetWidth: 1200,
      getBoundingClientRect: () => ({ left: 900, top: 100, width: 600, height: 280 }),
      contentDocument: { querySelectorAll: () => [el("framed", { left: 0, top: 0, width: 200, height: 100 }, "Buy", "button")] },
    };
    const iframeOnly = fakeHost({ "[data-right-panel] iframe": [iframe] });
    expect(resolvePageTargets({ x: 890, y: 90, w: 120, h: 80 }, iframeOnly).map((h) => h.target.id)).toEqual(["framed"]);

    const both = fakeHost({
      "[data-right-panel]": [{ getBoundingClientRect: () => PANEL_R }],
      "[data-right-panel] [data-screen-root]": [pageRoot({ left: 800, top: 0, width: 400, height: 600 }, [
        domNode("live", { left: 900, top: 100, width: 100, height: 40 }),
      ])],
      "[data-right-panel] iframe": [iframe],
    });
    expect(resolvePageTargets({ x: 0, y: 0, w: 2000, h: 2000 }, both).map((h) => h.target.id)).toEqual(["live"]);
  });

  it("returns no targets when neither a live page nor an iframe is present", () => {
    expect(resolvePageTargets({ x: 0, y: 0, w: 2000, h: 2000 }, fakeHost({}))).toEqual([]);
  });
});
