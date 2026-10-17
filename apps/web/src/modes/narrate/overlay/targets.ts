import type { IntentRequest } from "@create/shared";

export type LassoRect = { x: number; y: number; w: number; h: number };
export type LassoTarget = { id: string; label: string; kind: "node" | "shape" };
export type LassoHit = { target: LassoTarget; box: LassoRect };
export type LassoResolver = (rect: LassoRect) => LassoHit[];

const MAX_TARGETS = 24;

export function snippet(text: string | null | undefined, max = 40): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export function nodeLabel(type: string, text: string | null | undefined): string {
  const s = snippet(text);
  return s ? `${type}: ${s}` : type;
}

/** Fraction of box `b` covered by `rect` (0..1). */
export function overlapFraction(b: LassoRect, rect: LassoRect): number {
  const area = b.w * b.h;
  if (area <= 0) return 0;
  const ix = Math.max(0, Math.min(b.x + b.w, rect.x + rect.w) - Math.max(b.x, rect.x));
  const iy = Math.max(0, Math.min(b.y + b.h, rect.y + rect.h) - Math.max(b.y, rect.y));
  return (ix * iy) / area;
}

/** Elements marked data-node-id inside [data-screen-root]. */
export function resolveDomTargets(rect: LassoRect, root: ParentNode = document): LassoHit[] {
  const out: LassoHit[] = [];
  root.querySelectorAll("[data-screen-root] [data-node-id]").forEach((el) => {
    if (out.length >= MAX_TARGETS) return;
    const id = el.getAttribute("data-node-id");
    if (!id) return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const box = { x: r.left, y: r.top, w: r.width, h: r.height };
    if (overlapFraction(box, rect) < 0.5) return;
    const type = el.getAttribute("data-node-type") || el.tagName.toLowerCase();
    out.push({ target: { id, label: nodeLabel(type, (el as HTMLElement).innerText ?? el.textContent), kind: "node" }, box });
  });
  return out;
}

export const LIVE_COMMAND_WINDOW_MS = 4000;

/** Build a route-intent request if a final transcript follows a lasso closely enough. */
export function buildIntentRequest(
  transcript: string,
  lasso: { t: number; targets: LassoTarget[] } | null,
  now: number,
): IntentRequest | null {
  const text = transcript.trim();
  if (!text || !lasso || lasso.targets.length === 0) return null;
  if (now - lasso.t > LIVE_COMMAND_WINDOW_MS) return null;
  return { transcript: text.slice(0, 4000), candidates: lasso.targets.slice(0, 100) };
}
