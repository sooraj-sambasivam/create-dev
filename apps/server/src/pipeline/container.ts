import type { Ancestor, ContainerKind, LocateKind, LocateResult, LocateScope, LocateSource, PixelBox } from "@create/shared";
import { area, contains, iou } from "./geometry";

/** What the utterance wants to point at. "unknown" falls back to what the structure offers. */
export type PointIntent = LocateScope | "unknown";

// Order matters: a value question wins over a row noun ("what time is this train?" is a cell), an explicit "row" over a lift verb, a lift verb over a row noun ("track this train" lifts the whole timetable).
const CELL_RE = /\b(how (much|many)|what time|when|number|value|price|prices|amount|total|percent(age)?|cost|costs|column|header|heading|title|label|cell|button|link|text|name|date|sum|average|count)\b|[%$\d]/i;
const ROW_RE = /\b(row|one|entry|item|company|train|bus|person|order|record|listing|result|product|flight|game|team|employee|customer)\b/i;
const CONTAINER_RE = /\b(table|list|chart|graph|sheet|grid|schedule|pricing|dashboard|data|cards?|app|track|monitor|watch|turn|make|build|convert)\b/i;
/** Verbs that mean "make an app out of the whole thing": they beat a row noun ("track this train" lifts the timetable, not one train). */
const LIFT_VERB_RE = /\b(track|monitor|watch|turn|make|build|convert|lift)\b/i;
const ACTION_RE = /^\W*(please\s+)?(open|click|press|switch|start|sign|select|go|toggle|submit|buy|subscribe|explain)\b/i;

export function classifyIntent(utterance?: string): PointIntent {
  const u = (utterance ?? "").trim();
  if (!u) return "unknown";
  if (CELL_RE.test(u)) return "cell";
  if (/\b(row|entry)\b/i.test(u)) return "row";
  if (LIFT_VERB_RE.test(u)) return "container";
  if (ROW_RE.test(u)) return "row";
  if (CONTAINER_RE.test(u)) return "container";
  if (ACTION_RE.test(u)) return "cell";
  return "unknown";
}

/** Candidate order for an intent. "container" means the table/list/chart/cards container, then the row, then the cell. */
export function scopeOrder(intent: PointIntent, hasDataContainer: boolean): LocateScope[] {
  switch (intent) {
    case "cell":
      return ["cell", "row", "container"];
    case "row":
      return ["row", "container", "cell"];
    case "container":
      return ["container", "row", "cell"];
    default:
      return hasDataContainer ? ["container", "row", "cell"] : ["cell", "row", "container"];
  }
}

/** Confidence multiplier by rank: the preferred scope keeps its confidence, the others sink. */
export const RANK_WEIGHT = [1, 0.6, 0.4] as const;
const WEAK_TOP = 0.65;

export interface Part {
  box: PixelBox;
  kind: LocateKind;
  label: string;
}
export type Parts = Partial<Record<LocateScope, Part>>;

export const ANCESTOR_KIND_TO_LOCATE: Record<ContainerKind, LocateKind> = { table: "table", row: "table", list: "list", chart: "chart", card: "list", section: "other" };
const CONTAINER_PRIORITY: ReadonlySet<ContainerKind> = new Set(["table", "list", "chart", "card"]);
export const isDataKind = (k: LocateKind) => k === "table" || k === "list" || k === "chart";

/** The row ancestor and the nearest table/list/chart/card container (else the nearest section). Charts widen to the outermost chart ancestor in a run. */
export function pickAncestors(ancestors: readonly Ancestor[] | undefined): { row?: Ancestor; container?: Ancestor } {
  const list = ancestors ?? [];
  const row = list.find((a) => a.kind === "row");
  let i = list.findIndex((a) => CONTAINER_PRIORITY.has(a.kind));
  let container: Ancestor | undefined;
  if (i >= 0) {
    container = list[i]!;
    if (container.kind === "chart") while (list[i + 1]?.kind === "chart") container = list[++i]!;
  } else container = list.find((a) => a.kind === "section");
  return { row, container };
}

export function clipBox(b: PixelBox, size?: { w: number; h: number }): PixelBox | null {
  if (!size) return b.w > 0 && b.h > 0 ? b : null;
  const x1 = Math.max(0, b.x);
  const y1 = Math.max(0, b.y);
  const x2 = Math.min(size.w, b.x + b.w);
  const y2 = Math.min(size.h, b.y + b.h);
  return x2 - x1 > 0 && y2 - y1 > 0 ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
}

export interface RankOpts {
  source: LocateSource;
  intent: PointIntent;
  cursor?: { x: number; y: number };
  size?: { w: number; h: number };
  /** Confidence of the top candidate when the choice is strong. */
  topConfidence: number;
}

/** Turn container/row/cell parts into ordered candidates (preferred scope first), clipped to the image, near-duplicates dropped. */
export function rankParts(parts: Parts, o: RankOpts): LocateResult[] {
  const container = parts.container;
  const order = scopeOrder(o.intent, !!container && isDataKind(container.kind)).filter((s) => parts[s]);
  const out: LocateResult[] = [];
  for (const scope of order) {
    const p = parts[scope]!;
    const box = clipBox(p.box, o.size);
    if (!box) continue;
    if (out.some((r) => iou(r.box, box) > 0.9)) continue;
    const rank = out.length;
    const strong = o.intent !== "unknown" || (scope === "container" && isDataKind(p.kind));
    const top = strong ? o.topConfidence : Math.min(o.topConfidence, WEAK_TOP);
    const inside = o.cursor ? contains(box, o.cursor) : true;
    out.push({ box, kind: p.kind, label: p.label, source: o.source, scope, confidence: Math.round(top * RANK_WEIGHT[Math.min(rank, 2)]! * (inside ? 1 : 0.35) * 1000) / 1000 });
  }
  return out;
}

export const smallest = <T extends { frame: PixelBox }>(nodes: T[]): T | undefined => nodes.reduce<T | undefined>((m, n) => (!m || area(n.frame) < area(m.frame) ? n : m), undefined);
