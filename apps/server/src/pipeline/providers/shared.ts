import { LOCATE_KINDS, type LocateKind, type LocateResult, type LocateSource } from "@create/shared";
import { boxFromCorners, clamp01, distanceTo, contains } from "../geometry";
import type { FetchFn, ProviderCtx } from "../types";

/** fetch with a hard timeout; the key never appears in thrown messages. */
export async function timedFetch(ctx: ProviderCtx, url: string, init: RequestInit, fetchImpl?: FetchFn): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  try {
    return await (fetchImpl ?? ctx.deps.fetchImpl ?? fetch)(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw new Error(controller.signal.aborted ? `timeout after ${ctx.timeoutMs}ms` : `network error: ${err instanceof Error ? err.name : "unknown"}`);
  } finally {
    clearTimeout(timer);
  }
}

export function kindFromText(s: string | undefined): LocateKind {
  const t = (s ?? "").toLowerCase();
  const exact = LOCATE_KINDS.find((k) => k === t);
  if (exact) return exact;
  if (/table|grid|sheet|spreadsheet|schedule|timetable/.test(t)) return "table";
  if (/chart|graph|plot/.test(t)) return "chart";
  if (/list|menu/.test(t)) return "list";
  if (/button|link|control/.test(t)) return "button";
  if (/image|photo|picture/.test(t)) return "image";
  if (/text|paragraph|heading|block/.test(t)) return "text";
  return "other";
}

/** Cursor as 0-1 fractions of the coordinate space, or null. */
export function cursorFraction(ctx: ProviderCtx): { x: number; y: number } | null {
  const c = ctx.input.cursor;
  const s = ctx.image?.coord;
  if (!c || !s) return null;
  return { x: clamp01(c.x / s.w), y: clamp01(c.y / s.h) };
}

/**
 * Confidence for a pixel detection with no native score: containing the cursor is strong evidence,
 * and smaller containing boxes beat bigger ones (handled by fusion); nearby boxes decay with distance.
 */
export function proximityConfidence(box: LocateResult["box"], ctx: ProviderCtx, base: number): number {
  const c = ctx.input.cursor;
  const s = ctx.image?.coord;
  if (!c || !s) return base * 0.6;
  if (contains(box, c)) return base;
  const diag = Math.hypot(s.w, s.h);
  return Math.max(0.15, base * 0.7 - (distanceTo(box, c) / diag) * 2);
}

export const BOX_PROMPT = (frac: { x: number; y: number } | null, extra = ""): string =>
  `Find the table, chart, list, button or text block ${
    frac ? `under the pointer at x=${frac.x.toFixed(3)}, y=${frac.y.toFixed(3)} (fractions from the top-left)` : "most prominent in this screenshot"
  }. ${extra}Reply with only JSON: {"boxes":[{"label":string,"kind":"table"|"chart"|"list"|"text"|"image"|"button"|"other","box_2d":[ymin,xmin,ymax,xmax]}]} with box_2d normalized to 0-1000. Most likely target first, at most 3 boxes. If nothing is there, reply {"boxes":[]}.`;

/** Parses {"boxes":[{label,kind,box_2d}]} (0-1000) into results in the coordinate space. */
export function parseBoxJson(text: string, ctx: ProviderCtx, source: LocateSource, base: number): LocateResult[] {
  const m = /\{[\s\S]*\}/.exec(text);
  const s = ctx.image?.coord;
  if (!m || !s) return [];
  let raw: { boxes?: { label?: unknown; kind?: unknown; box_2d?: unknown }[] };
  try {
    raw = JSON.parse(m[0]);
  } catch {
    throw new Error("unparseable JSON");
  }
  const out: LocateResult[] = [];
  for (const [i, b] of (raw.boxes ?? []).slice(0, 3).entries()) {
    const v = b.box_2d;
    if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === "number")) continue;
    const [ymin, xmin, ymax, xmax] = v as number[];
    const box = boxFromCorners((xmin! / 1000) * s.w, (ymin! / 1000) * s.h, (xmax! / 1000) * s.w, (ymax! / 1000) * s.h);
    if (!box) continue;
    const kind = kindFromText(typeof b.kind === "string" ? b.kind : typeof b.label === "string" ? b.label : undefined);
    out.push({
      box,
      kind,
      label: (typeof b.label === "string" && b.label.trim() ? b.label : kind).slice(0, 120),
      source,
      confidence: Math.max(0.1, proximityConfidence(box, ctx, base) - i * 0.1),
    });
  }
  return out;
}
