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

/** Speech may land up to this long after a lasso... */
export const LASSO_SPEECH_AFTER_MS = 8000;
/** ...or up to this long before it ("make this bigger", then Shift+drag). */
export const LASSO_SPEECH_BEFORE_MS = 4000;
export const LIVE_COMMAND_WINDOW_MS = LASSO_SPEECH_AFTER_MS;
/** Below this the router is guessing, so the edit is not applied. */
export const MIN_INTENT_CONFIDENCE = 0.5;

const DEICTIC_RE = /\b(this|that|these|those|here|it)\b/i;

/** True when the line points at something ("make this bigger", "swap that photo", "fix it"). */
export function isDeictic(text: string): boolean {
  return DEICTIC_RE.test(text);
}

/** "heading: Welcome" becomes "Heading · Welcome", for display. */
export function prettyLabel(label: string): string {
  const i = label.indexOf(": ");
  const type = i < 0 ? label : label.slice(0, i);
  const rest = i < 0 ? "" : label.slice(i + 2);
  const head = type.charAt(0).toUpperCase() + type.slice(1);
  return rest ? `${head} · ${rest}` : head;
}

/** The page node under the pointer. `el` lets the bubble re-measure the outline while the page scrolls. */
export type HoverHit = { id: string; label: string; area: number; box: LassoRect; el?: ElementLike };

/** The slice of the page root the hover resolver reads. */
type RootLike = { contains(n: never): boolean; getBoundingClientRect(): ClientRect };

/**
 * Picks the page node under the pointer from a top-first element stack (document.elementsFromPoint).
 * The first stacked element that carries a data-node-id inside `root` is the deepest node hit, so a
 * heading wins over the section around it. `closest` is used for children such as inline spans.
 */
export function pickHover(stack: readonly (ElementLike & { closest?(sel: string): ElementLike | null })[], root: RootLike): HoverHit | null {
  for (const raw of stack) {
    const el = raw.getAttribute("data-node-id") ? raw : raw.closest?.("[data-node-id]");
    const id = el?.getAttribute("data-node-id");
    if (!el || !id || !root.contains(el as never)) continue;
    const r = el.getBoundingClientRect();
    const type = el.getAttribute("data-node-type") || el.tagName.toLowerCase();
    return {
      id,
      label: nodeLabel(type, el.innerText ?? el.textContent),
      area: Math.max(0, r.width) * Math.max(0, r.height),
      box: toBox(r),
      el,
    };
  }
  return null;
}

/** The page node under the pointer in the right panel's live page, or null off the page. */
export function resolveHoverAt(x: number, y: number, host: Document = document): HoverHit | null {
  const root = host.querySelector<HTMLElement>(PANEL_PAGE_ROOT);
  if (!root || typeof host.elementsFromPoint !== "function") return null;
  const rb = root.getBoundingClientRect();
  if (x < rb.left || x > rb.right || y < rb.top || y > rb.bottom) return null;
  return pickHover(host.elementsFromPoint(x, y) as unknown as ElementLike[], root);
}

export type PointerSample = { t: number; x: number; y: number; hit: HoverHit | null };

/** How far back pointer samples are kept. Long enough to bind a target at the start of a long utterance. */
export const POINTER_BUFFER_MS = 12000;

/** Appends a sample and drops those older than the window, always keeping the newest sample at or before the cutoff. */
export function pushSample(buf: PointerSample[], s: PointerSample, maxAge = POINTER_BUFFER_MS): void {
  buf.push(s);
  const cutoff = s.t - maxAge;
  let keepFrom = 0;
  while (keepFrom + 1 < buf.length && buf[keepFrom + 1].t <= cutoff) keepFrom++;
  if (keepFrom > 0) buf.splice(0, keepFrom);
}

/** The latest sample taken at or before `t` (where the pointer was when speech started), or null. */
export function sampleAt(buf: readonly PointerSample[], t: number): PointerSample | null {
  let found: PointerSample | null = null;
  for (const s of buf) {
    if (s.t <= t) found = s;
    else break;
  }
  return found;
}

/**
 * Build a route-intent request for a final transcript. `now` is when the line was said. A lasso counts when
 * the speech lands up to 8s after it or up to 4s before it; otherwise the hovered element, if any, is the
 * only candidate. `hover` is where the pointer was when the utterance started.
 */
export function buildIntentRequest(
  transcript: string,
  lasso: { t: number; targets: LassoTarget[] } | null,
  now: number,
  hover: HoverHit | null = null,
): IntentRequest | null {
  const text = transcript.trim().slice(0, 4000);
  if (!text) return null;
  const dt = lasso ? now - lasso.t : 0;
  if (lasso && lasso.targets.length > 0 && dt <= LASSO_SPEECH_AFTER_MS && dt >= -LASSO_SPEECH_BEFORE_MS) {
    const candidates = lasso.targets.slice(0, 100);
    const hovered = hover ? candidates.find((c) => c.id === hover.id) : undefined;
    const only = candidates.length === 1 ? candidates[0] : undefined;
    const pick = hovered ?? only;
    return { transcript: text, candidates, pointer: { targetId: pick?.id ?? null, ...(pick ? { label: pick.label } : {}) } };
  }
  if (hover) {
    const label = hover.label.slice(0, 200);
    return {
      transcript: text,
      candidates: [{ id: hover.id, label, kind: "node" }],
      pointer: { targetId: hover.id, label },
    };
  }
  return null;
}

export type Resolution =
  | { kind: "target"; id: string; label: string }
  | { kind: "ask"; labels: string[] }
  | { kind: "none" };

/**
 * Client-side pre-resolve of "this/that": one candidate is the target; with several, the hovered one wins,
 * then the clearly smallest leaf (`areas` by id). Anything else is ambiguous and must be asked about.
 * A line that is not deictic with several candidates is left to the router ("none").
 */
export function preResolve(req: IntentRequest, areas: Record<string, number> = {}): Resolution {
  const cands = req.candidates;
  if (cands.length === 0) return { kind: "none" };
  if (cands.length === 1) return { kind: "target", id: cands[0].id, label: cands[0].label };
  if (!isDeictic(req.transcript)) return { kind: "none" };
  const ptr = req.pointer?.targetId;
  const hovered = ptr ? cands.find((c) => c.id === ptr) : undefined;
  if (hovered) return { kind: "target", id: hovered.id, label: hovered.label };
  const sized = cands.filter((c) => (areas[c.id] ?? 0) > 0).sort((a, b) => areas[a.id] - areas[b.id]);
  if (sized.length > 0 && (sized.length === 1 || areas[sized[0].id] <= 0.8 * areas[sized[1].id])) {
    return { kind: "target", id: sized[0].id, label: sized[0].label };
  }
  return { kind: "ask", labels: cands.slice(0, 4).map((c) => prettyLabel(c.label)) };
}

/** "Which one? (Heading · Welcome, Button · Buy)" */
export function askText(labels: string[]): string {
  return `Which one? (${labels.join(", ")})`;
}
