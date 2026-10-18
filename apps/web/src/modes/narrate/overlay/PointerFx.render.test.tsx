import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfidenceMeter, PointerFx, type PointerFxProps } from "./PointerFx";
import { PipBody, faceTone } from "../../../companion/PipBody";
import { CURSOR_SKIN } from "../../../ghost/GhostCursor";

/** True when an element (not the stylesheet) carries the class. */
const has = (html: string, c: string) => new RegExp(`class="[^"]*\\b${c}\\b`).test(html);

const base: PointerFxProps = {
  look: "paper",
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
  it("Paper draws a wobbly ink outline and a highlighter on 'this'", () => {
    const html = renderToStaticMarkup(<PointerFx {...base} />);
    expect(has(html, "pfx-draw")).toBe(true);
    expect(html).toContain('data-look-fx="paper"');
    expect(has(html, "pfx-hl")).toBe(true);
    expect(html).toContain(">this<");
    expect(has(html, "pfx-lock")).toBe(false);
    expect(html).toContain("600 × 300");
  });

  it("Luminous draws brackets and a glow, not ink", () => {
    const html = renderToStaticMarkup(<PointerFx {...base} look="luminous" />);
    expect(has(html, "pfx-lock")).toBe(true);
    expect(html).toContain("box-shadow:0 0 40px 6px var(--color-glow)");
    expect(has(html, "pfx-draw")).toBe(false);
  });

  it("draws nothing around a target when there is none", () => {
    const html = renderToStaticMarkup(<PointerFx {...base} rect={null} note={null} caption={null} ring={null} />);
    expect(has(html, "pfx-draw")).toBe(false);
    expect(has(html, "pfx-lock")).toBe(false);
  });

  it("marks reduced motion", () => {
    expect(has(renderToStaticMarkup(<PointerFx {...base} reduce />), "pfx-still")).toBe(true);
  });

  it("types the margin note in full under reduced motion", () => {
    expect(renderToStaticMarkup(<PointerFx {...base} reduce />)).toContain("12 rows, 4 columns");
  });
});

describe("ConfidenceMeter", () => {
  it("fills pen dots on Paper and segments on Luminous", () => {
    const paper = renderToStaticMarkup(<ConfidenceMeter look="paper" value={0.93} />);
    expect(paper).toContain('data-confidence="5"');
    expect(paper).toContain("rounded-full");
    const lum = renderToStaticMarkup(<ConfidenceMeter look="luminous" value={0.58} />);
    expect(lum).toContain('data-confidence="3"');
    expect(lum).toContain("var(--color-glow)");
  });
});

describe("Pip and the agent cursor", () => {
  it("Pip is an ink blot in Paper and a light orb in Luminous", () => {
    expect(renderToStaticMarkup(<PipBody look="paper" />)).toContain('data-pip-body="blot"');
    expect(renderToStaticMarkup(<PipBody look="luminous" />)).toContain('data-pip-body="orb"');
    expect(faceTone("paper")).toBe("light");
    expect(faceTone("luminous")).toBe("dark");
  });

  it("the agent cursor is hollow pen-blue on Paper and magenta glass on Luminous", () => {
    expect(CURSOR_SKIN.paper.fill).toBe("transparent");
    expect(CURSOR_SKIN.paper.stroke).toContain("--color-pen");
    expect(CURSOR_SKIN.luminous.stroke).toContain("--color-accent");
    expect(CURSOR_SKIN.luminous.tag.backdropFilter).toContain("blur");
  });
});
