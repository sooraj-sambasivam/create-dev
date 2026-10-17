import { GenerateResponseSchema, mockGenerate, type GenerateResponse, type ShapeSummary } from "@create/shared";

type Json = Record<string, unknown>;

const SKIP_TYPES = new Set(["arrow", "line", "draw", "highlight", "group", "frame"]);

function clean(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** One shape becomes one node. Text is kept verbatim; boxes become buttons, cards or image placeholders. */
function nodeFor(s: ShapeSummary, id: string): Json {
  const text = clean(s.text);
  const aspect = s.w / Math.max(s.h, 1);
  if (s.type === "text" || s.type === "note") {
    if (!text) return { id, type: "spacer", size: "sm" };
    const big = s.h >= 48 || text.length <= 24;
    return big && s.type === "text"
      ? { id, type: "heading", text, level: s.h >= 80 ? 1 : s.h >= 48 ? 2 : 3 }
      : { id, type: "text", text };
  }
  // Rectangles, ellipses and other boxes.
  if (text && aspect >= 2 && s.h <= 90) return { id, type: "button", label: text, variant: "primary" };
  if (!text && aspect >= 2 && s.h <= 90) return { id, type: "button", label: "Button", variant: "secondary" };
  if (!text && (s.type === "image" || s.type === "ellipse" || (aspect > 0.6 && aspect < 1.7 && s.h >= 80))) {
    return { id, type: "image", alt: "Image placeholder", query: "abstract modern workspace", aspect: aspect > 1.4 ? "wide" : aspect < 0.8 ? "portrait" : "square" };
  }
  if (text) {
    return {
      id, type: "container", background: "surface", padding: "md", gap: "sm",
      children: [{ id: `${id}-text`, type: "text", text }],
    };
  }
  return { id, type: "container", background: "muted", padding: "lg", children: [{ id: `${id}-space`, type: "spacer", size: "md" }] };
}

/**
 * Deterministic Screen from a sketch's shapes. Shapes are read top to bottom; shapes whose vertical
 * extent mostly overlaps share a row, ordered left to right. Arrows and strokes are ignored.
 * No drawable shapes falls back to Abel's mockGenerate.
 */
export function buildMockSketchScreen(shapes: ShapeSummary[], prompt?: string): GenerateResponse {
  const drawable = shapes.filter((s) => !SKIP_TYPES.has(s.type) && (clean(s.text) || (s.w > 0 && s.h > 0)));
  if (drawable.length === 0) return mockGenerate(prompt ?? "");

  const sorted = [...drawable].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  const rows: ShapeSummary[][] = [];
  for (const s of sorted) {
    const row = rows[rows.length - 1];
    const rowTop = row ? Math.min(...row.map((r) => r.y)) : 0;
    const rowBottom = row ? Math.max(...row.map((r) => r.y + r.h)) : 0;
    const overlap = row ? Math.min(rowBottom, s.y + s.h) - Math.max(rowTop, s.y) : 0;
    if (row && overlap > 0.5 * Math.min(s.h, rowBottom - rowTop)) row.push(s);
    else rows.push([s]);
  }

  let n = 0;
  const children = rows.map((row, ri): Json => {
    const items = row.sort((a, b) => a.x - b.x).map((s) => nodeFor(s, `sketch-${++n}`));
    return items.length === 1
      ? items[0]
      : { id: `sketch-row-${ri + 1}`, type: "container", direction: "row", align: "center", wrap: true, gap: "md", children: items };
  });

  const firstHeading = drawable.find((s) => s.type === "text" && clean(s.text));
  const title = clean(firstHeading?.text).slice(0, 60) || "Sketch";
  return GenerateResponseSchema.parse({
    summary: `Mock mode: turned ${drawable.length} sketch shape${drawable.length === 1 ? "" : "s"} into a layout.`,
    screen: { title, accent: "#4f46e5", children },
  });
}
