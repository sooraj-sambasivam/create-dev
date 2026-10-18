import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfidenceMeter, PointerFx, type PointerFxProps } from "./PointerFx";

/** True when an element (not the stylesheet) carries the class. */
const has = (html: string, c: string) => new RegExp(`class="[^"]*\\b${c}\\b`).test(html);

const base: PointerFxProps = {
  rect: { left: 100, top: 120, width: 600, height: 300 },
  seed: "t1:table",
  strong: true,
  reduce: false,
  ticks: true,
  note: "12 rows, 4 columns",
  caption: "make this a tracker",
  cursor: { x: 50, y: 60 },
  ring: { key: "k", show: true },
  viewport: { w: 1200, h: 800 },
};

describe("PointerFx", () => {
  it("outlines the target in a 2px accent line and marks 'this' in the caption", () => {
    const html = renderToStaticMarkup(<PointerFx {...base} />);
    expect(html).toContain('data-part="pointer-outline"');
    expect(html).toContain("stroke-width:2");
    expect(has(html, "pfx-hl")).toBe(true);
    expect(html).toContain(">this<");
    expect(html).toContain("600 × 300");
  });

  it("has no glow, spotlight dim or ink wobble", () => {
    const html = renderToStaticMarkup(<PointerFx {...base} />);
    expect(html).not.toContain("--color-glow");
    expect(html).not.toContain("spotlight");
    expect(has(html, "pfx-draw")).toBe(false);
  });

  it("draws nothing around a target when there is none", () => {
    const html = renderToStaticMarkup(<PointerFx {...base} rect={null} note={null} caption={null} ring={null} />);
    expect(html).not.toContain('data-part="pointer-outline"');
  });

  it("marks reduced motion", () => {
    expect(has(renderToStaticMarkup(<PointerFx {...base} reduce />), "pfx-still")).toBe(true);
  });

  it("types the note in full under reduced motion", () => {
    expect(renderToStaticMarkup(<PointerFx {...base} reduce />)).toContain("12 rows, 4 columns");
  });
});

describe("ConfidenceMeter", () => {
  it("fills one dot per step", () => {
    expect(renderToStaticMarkup(<ConfidenceMeter value={0.93} />)).toContain('data-confidence="5"');
    expect(renderToStaticMarkup(<ConfidenceMeter value={0.58} />)).toContain('data-confidence="3"');
  });
});
