import type { Editor, TLShapeId } from "tldraw";
import type { ShapeSummary } from "@create/shared";

/** Minimal structural view of a tldraw shape, so the mapping is testable with plain objects. */
export type ShapeLike = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};
export type BoundsLike = { x: number; y: number; w: number; h: number };

type RichNode = { type?: string; text?: string; content?: RichNode[] };

/** Flatten a tldraw rich-text (ProseMirror) doc to plain text, one line per block. */
export function richTextToPlain(doc: unknown): string {
  const walk = (n: RichNode): string => {
    if (typeof n.text === "string") return n.text;
    if (!Array.isArray(n.content)) return n.type === "hardBreak" ? "\n" : "";
    const inner = n.content.map(walk);
    return n.type === "doc" ? inner.join("\n") : inner.join("");
  };
  if (!doc || typeof doc !== "object") return "";
  return walk(doc as RichNode).trim();
}

/** Text carried by a shape: richText (tldraw 5), legacy text prop, or name. */
export function shapeText(shape: ShapeLike): string | undefined {
  const p = shape.props ?? {};
  const rich = richTextToPlain(p.richText);
  const text = rich || (typeof p.text === "string" ? p.text.trim() : "") || (typeof p.name === "string" ? p.name.trim() : "");
  return text || undefined;
}

/** Library origin of a placed shape ({ icon: "lucide:star" }, { photo: url }, ...), so canvas-ops knows what it is. */
export function shapeMeta(shape: ShapeLike): Record<string, string> | undefined {
  const kind = shape.meta?.libraryKind;
  const value = shape.meta?.value;
  if (typeof kind !== "string" || typeof value !== "string" || !value) return undefined;
  return { [kind]: value.slice(0, 2000) };
}

/** Pure mapping: shape + page bounds -> ShapeSummary. */
export function toSummary(shape: ShapeLike, bounds: BoundsLike | undefined): ShapeSummary {
  const text = shapeText(shape);
  const meta = shapeMeta(shape);
  const r = (n: number) => Math.round(n);
  return {
    id: shape.id,
    type: shape.type,
    ...(text ? { text } : {}),
    ...(meta ? { meta } : {}),
    x: r(bounds?.x ?? 0),
    y: r(bounds?.y ?? 0),
    w: r(bounds?.w ?? 0),
    h: r(bounds?.h ?? 0),
  };
}

/** Summaries of the given shapes (default: every shape on the current page). */
export function summarizeShapes(editor: Editor, ids?: string[]): ShapeSummary[] {
  const shapeIds = (ids?.length ? ids : [...editor.getCurrentPageShapeIds()]) as TLShapeId[];
  const out: ShapeSummary[] = [];
  for (const id of shapeIds) {
    const shape = editor.getShape(id);
    if (!shape) continue;
    out.push(toSummary(shape as unknown as ShapeLike, editor.getShapePageBounds(id)));
  }
  return out;
}

/** True when two page-space boxes overlap (touching edges do not count). */
export function boxesOverlap(a: BoundsLike, b: BoundsLike): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Summaries of placed library shapes (icons/photos, carrying meta) that overlap the region and are not already in `excludeIds`,
 * so canvas-ops knows "put this icon here". Pure over summaries; capped to keep the request small.
 */
export function libraryShapesInRegion(all: readonly ShapeSummary[], region: BoundsLike, excludeIds: readonly string[] = [], cap = 20): ShapeSummary[] {
  const skip = new Set(excludeIds);
  return all
    .filter((s) => !skip.has(s.id) && (s.meta?.icon || s.meta?.photo) && boxesOverlap(s, region))
    .slice(0, cap);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error("read failed"));
    fr.readAsDataURL(blob);
  });
}

/** PNG data URL of the given shapes (default: whole page). Empty string if nothing to export. */
export async function exportPng(editor: Editor, ids?: string[]): Promise<string> {
  const shapeIds = (ids?.length ? ids : [...editor.getCurrentPageShapeIds()]) as TLShapeId[];
  if (!shapeIds.length) return "";
  const { blob } = await editor.toImage(shapeIds, { format: "png", background: true, darkMode: false, padding: 24, scale: 1, pixelRatio: 1 });
  return blobToDataUrl(blob);
}
