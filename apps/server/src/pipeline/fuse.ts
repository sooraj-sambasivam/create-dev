import type { LocateKind, LocateResult, LocateSource } from "@create/shared";
import { contains, iou } from "./geometry";

/** How much each source is trusted before its own confidence is applied. */
export const SOURCE_PRIOR: Record<LocateSource, number> = { ax: 1, dom: 0.9, perceptron: 0.85, gemini: 0.75, jev: 0.45, claude: 0.7, fused: 1 };
const DATA_KINDS: ReadonlySet<LocateKind> = new Set(["table", "chart", "list"]);
const NON_DATA_WEIGHT = 0.6;
const OFF_CURSOR_WEIGHT = 0.6;
/** A non-data box covering most of the capture is the window or page, not a target (eval: AX returned whole windows on 6 of 22 web targets). */
const HUGE_AREA_SHARE = 0.6;
const HUGE_WEIGHT = 0.4;
export const AGREE_IOU = 0.5;
export const AGREE_BONUS = 0.1;
export const MIN_SCORE = 0.35;
/** The runner-up is "close" when it scores at least this share of the winner. */
export const CLOSE_RATIO = 0.75;

export interface Scored {
  r: LocateResult;
  score: number;
}
interface Cluster {
  best: Scored;
  sources: Set<LocateSource>;
}

export function score(r: LocateResult, cursor?: { x: number; y: number }, imageSize?: { w: number; h: number }): number {
  let s = SOURCE_PRIOR[r.source] * r.confidence;
  if (imageSize && !DATA_KINDS.has(r.kind) && r.box.w * r.box.h > HUGE_AREA_SHARE * imageSize.w * imageSize.h) s *= HUGE_WEIGHT;
  if (!DATA_KINDS.has(r.kind)) s *= NON_DATA_WEIGHT;
  if (cursor && !contains(r.box, cursor)) s *= OFF_CURSOR_WEIGHT;
  return s;
}

export interface FusionOutcome {
  result: LocateResult | null;
  ask?: string;
}

const short = (r: LocateResult) => `${(r.label || r.kind).slice(0, 40)} (${r.kind})`;

export function fuse(all: LocateResult[], cursor?: { x: number; y: number }, imageSize?: { w: number; h: number }): FusionOutcome {
  const scored: Scored[] = all.map((r) => ({ r, score: score(r, cursor, imageSize) })).sort((a, b) => b.score - a.score);
  const clusters: Cluster[] = [];
  for (const s of scored) {
    const home = clusters.find((c) => iou(c.best.r.box, s.r.box) > AGREE_IOU);
    if (home) home.sources.add(s.r.source);
    else clusters.push({ best: s, sources: new Set([s.r.source]) });
  }
  const ranked = clusters
    .map((c) => ({ ...c, total: c.best.score + AGREE_BONUS * (c.sources.size - 1) }))
    .sort((a, b) => b.total - a.total);
  const top = ranked[0];
  if (!top || top.total < MIN_SCORE) {
    return { result: null, ask: "Which one? I could not find a confident match under the pointer. Move closer or name it." };
  }
  const agree = top.sources.size - 1;
  const confidence = Math.min(1, top.best.r.confidence + AGREE_BONUS * agree);
  const { candidates: _drop, ...bestBase } = top.best.r;
  const result: LocateResult = { ...bestBase, confidence, source: agree > 0 ? "fused" : top.best.r.source };
  const second = ranked[1];
  if (second && second.total >= MIN_SCORE && second.total >= CLOSE_RATIO * top.total) {
    const cands = ranked.slice(0, 3).map(({ best }) => {
      const { candidates: _c, ...base } = best.r;
      return base as LocateResult;
    });
    result.candidates = cands;
    return { result, ask: `Which one? (A: ${short(cands[0]!)} or B: ${short(cands[1]!)})`.slice(0, 300) };
  }
  return { result };
}
