import type { IntentRequest } from "@create/shared";

export type LassoRect = { x: number; y: number; w: number; h: number };
export type LassoTarget = { id: string; label: string; kind: "node" | "shape" };
export type LassoHit = { target: LassoTarget; box: LassoRect };
export type LassoResolver = (rect: LassoRect) => LassoHit[];

const MAX_TARGETS = 24;

type ClientRect = { left: number; top: number; width: number; height: number };

/** The slice of an Element the resolver reads (keeps the logic testable without a DOM). */
export type ElementLike = {
  getAttribute(name: string): string | null;
  getBoundingClientRect(): ClientRect;
  innerText?: string;
  textContent: string | null;
  tagName: string;
};

/** A page preview iframe in the right panel, with its document and its layout size. */
export type PageFrame = {
  frame: { offsetWidth: number; getBoundingClientRect(): ClientRect };
  doc: { querySelectorAll(selector: string): ArrayLike<ElementLike> };
};

export function snippet(text: string | null | undefined, max = 40): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export function nodeLabel(type: string, text: string | null | undefined): string {
  const s = snippet(text);
  return s ? `${type}: ${s}` : type;
}

const area = (b: LassoRect) => Math.max(0, b.w) * Math.max(0, b.h);

/** Fraction of box `b` covered by `rect` (0..1). */
export function overlapFraction(b: LassoRect, rect: LassoRect): number {
  const a = area(b);
  if (a <= 0) return 0;
  const ix = Math.max(0, Math.min(b.x + b.w, rect.x + rect.w) - Math.max(b.x, rect.x));
  const iy = Math.max(0, Math.min(b.y + b.h, rect.y + rect.h) - Math.max(b.y, rect.y));
  return (ix * iy) / a;
}

/** Intersection of two boxes, or null when they do not overlap. */
export function clipRect(a: LassoRect, b: LassoRect): LassoRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/** Screen pixels per layout pixel of a preview frame. A CSS-scaled frame reports a smaller rect than its layout width. */
export function frameScale(renderedWidth: number, layoutWidth: number): number {
  return renderedWidth > 0 && layoutWidth > 0 ? renderedWidth / layoutWidth : 1;
}

/** Maps a box in frame-local layout pixels to host viewport pixels. */
export function mapToHost(box: LassoRect, frameBox: LassoRect, scale: number): LassoRect {
  return { x: frameBox.x + box.x * scale, y: frameBox.y + box.y * scale, w: box.w * scale, h: box.h * scale };
}

/**
 * Appends the page nodes of `nodes` that the lasso covers. `toHost` maps a node's client box to host pixels,
 * and the mapped box is clipped to `clip` (the visible page area).
 */
function collectNodeHits(
  rect: LassoRect,
  nodes: ArrayLike<ElementLike>,
  clip: LassoRect,
  scale: number,
  toHost: (b: LassoRect) => LassoRect,
  out: LassoHit[],
): void {
  for (const el of Array.from(nodes)) {
    if (out.length >= MAX_TARGETS) return;
    const id = el.getAttribute("data-node-id");
    if (!id) continue;
    const r = el.getBoundingClientRect();
    if (r.width * scale < 4 || r.height * scale < 4) continue;
    const full = toHost({ x: r.left, y: r.top, w: r.width, h: r.height });
    const visible = clipRect(full, clip);
    if (!visible || area(visible) < 0.5 * area(full)) continue;
    if (overlapFraction(visible, rect) < 0.5) continue;
    const type = el.getAttribute("data-node-type") || el.tagName.toLowerCase();
    out.push({ target: { id, label: nodeLabel(type, el.innerText ?? el.textContent), kind: "node" }, box: visible });
  }
}

const toBox = (r: ClientRect): LassoRect => ({ x: r.left, y: r.top, w: r.width, h: r.height });

/**
 * Page nodes (data-node-id inside [data-screen-root]) under the lasso, across the given panel page frames.
 * Boxes are returned in host viewport pixels and clipped to the frame, so a lasso never selects what the
 * panel does not show.
 */
export function collectPageHits(rect: LassoRect, frames: readonly PageFrame[]): LassoHit[] {
  const out: LassoHit[] = [];
  for (const { frame, doc } of frames) {
    const frameBox = toBox(frame.getBoundingClientRect());
    const scale = frameScale(frameBox.w, frame.offsetWidth);
    const toHost = (b: LassoRect) => mapToHost(b, frameBox, scale);
    collectNodeHits(rect, doc.querySelectorAll("[data-screen-root] [data-node-id]"), frameBox, scale, toHost, out);
  }
  return out;
}

/** The live page in the right panel's Output tab. It is rendered in the main document (no iframe). */
export const PANEL_PAGE_ROOT = "[data-right-panel] [data-screen-root]";

/**
 * Page nodes under the lasso in the main document: the live [data-screen-root] inside [data-right-panel].
 * Each root is clipped to the panel's page area (the panel box intersected with the page root), so the
 * lasso never selects what the panel does not show. Host coordinates map 1:1 (scale 1).
 */
export function collectDomPageHits(rect: LassoRect, host: Document = document): LassoHit[] {
  const panel = host.querySelector<HTMLElement>("[data-right-panel]");
  if (!panel) return [];
  const panelBox = toBox(panel.getBoundingClientRect());
  const out: LassoHit[] = [];
  host.querySelectorAll<HTMLElement>(PANEL_PAGE_ROOT).forEach((root) => {
    const pageArea = clipRect(panelBox, toBox(root.getBoundingClientRect()));
    if (!pageArea) return;
    // Client rects of the main document are already viewport pixels, so the mapping is the identity.
    collectNodeHits(rect, root.querySelectorAll("[data-node-id]"), pageArea, 1, (b) => b, out);
  });
  return out;
}

/**
 * Hit-tests the page only where the right panel shows it. The live page (Output tab) is hit-tested in the
 * main document. The iframe path is a fallback, used only when no live page is present and a preview
 * iframe sits inside [data-right-panel].
 */
export function resolvePageTargets(rect: LassoRect, host: Document = document): LassoHit[] {
  if (host.querySelector(PANEL_PAGE_ROOT)) return collectDomPageHits(rect, host);
  const frames: PageFrame[] = [];
  host.querySelectorAll<HTMLIFrameElement>("[data-right-panel] iframe").forEach((f) => {
    const doc = f.contentDocument;
    if (doc) frames.push({ frame: f, doc });
  });
  return collectPageHits(rect, frames);
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
