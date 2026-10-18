import type { LocateKind } from "@create/shared";
import { ANCESTOR_KIND_TO_LOCATE, classifyIntent, pickAncestors, rankParts, type Parts } from "../container";
import { contains } from "../geometry";
import type { LocateProvider } from "../types";

function kindOf(tag: string, tableLike?: boolean): LocateKind {
  const t = tag.toLowerCase();
  if (tableLike || t === "table") return "table";
  if (t === "ul" || t === "ol" || t === "dl") return "list";
  if (t === "canvas" || t === "svg") return "chart";
  if (t === "img" || t === "picture") return "image";
  if (t === "button" || t === "a") return "button";
  return "text";
}

/**
 * DOM locate: the element rect plus its enclosing row and container (extension `ancestors`).
 * The utterance picks which comes first: "track this" -> table/list/chart/cards, "this row" -> row, a value question -> the element.
 */
export const locateDom: LocateProvider = async ({ input, image }) => {
  const d = input.dom;
  if (!d || d.rect.w <= 0 || d.rect.h <= 0) return [];
  const text = d.text.replace(/\s+/g, " ").trim().slice(0, 80);
  const elementKind = kindOf(d.tag, d.tableLike);
  const selfKind = kindOf(d.tag, false);
  const size = image?.coord ?? input.imageSize;

  const { row, container } = pickAncestors(d.ancestors);
  const parts: Parts = {};
  if (selfKind === "table" || selfKind === "list" || selfKind === "chart") {
    parts.container = { box: d.rect, kind: selfKind, label: text || `${d.tag.toLowerCase()} element` };
  } else {
    parts.cell = { box: d.rect, kind: d.ancestors?.length ? selfKind : elementKind, label: text || `${d.tag.toLowerCase()} element` };
    if (container) parts.container = { box: container.rect, kind: ANCESTOR_KIND_TO_LOCATE[container.kind], label: `${container.kind} (${container.role ?? container.tag})` };
  }
  if (row) parts.row = { box: row.rect, kind: "table", label: text ? `row: ${text}` : `row (${row.role ?? row.tag})` };

  // Legacy path (no ancestors): a single candidate, data-like when tableLike.
  if (!d.ancestors?.length) {
    const dataLike = elementKind === "table" || elementKind === "list" || elementKind === "chart";
    const inside = input.cursor ? contains(d.rect, input.cursor) : true;
    const confidence = !inside ? 0.3 : dataLike ? 0.9 : 0.65;
    return [{ box: d.rect, kind: elementKind, label: text || `${d.tag.toLowerCase()} element`, source: "dom", confidence, scope: dataLike ? "container" : "cell" }];
  }
  return rankParts(parts, { source: "dom", intent: classifyIntent(input.utterance), cursor: input.cursor, size, topConfidence: 0.9 });
};
