import type { LocateKind } from "@create/shared";
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

/** DOM locate: the element rect from the extension. High confidence when it is data-like and holds the cursor. */
export const locateDom: LocateProvider = async ({ input }) => {
  const d = input.dom;
  if (!d || d.rect.w <= 0 || d.rect.h <= 0) return [];
  const kind = kindOf(d.tag, d.tableLike);
  const dataLike = kind === "table" || kind === "list" || kind === "chart";
  const inside = input.cursor ? contains(d.rect, input.cursor) : true;
  const confidence = !inside ? 0.3 : dataLike ? 0.9 : 0.65;
  const text = d.text.replace(/\s+/g, " ").trim().slice(0, 80);
  return [{ box: d.rect, kind, label: text || `${d.tag.toLowerCase()} element`, source: "dom", confidence }];
};
