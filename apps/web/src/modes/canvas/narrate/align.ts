import type { PathPoint } from "./geometry";

/** One spoken utterance, ms since the session started. */
export type SpeechSpan = { start: number; end: number; text: string };
/** A lasso selection made at `t`. */
export type LassoMark = { t: number; ids: string[] };
export type Utterance = SpeechSpan & { targetIds: string[] };

/** A final-only transcript (batch engine) has no interim start; assume this speaking rate. */
const MS_PER_WORD = 400;
const MIN_LEAD = 800;
const MAX_LEAD = 8000;

/** Turns voice transcript callbacks (interim + final) into utterance spans. */
export function createSpeechTracker() {
  const spans: SpeechSpan[] = [];
  let cur: { start: number; text: string } | null = null;
  let lastActivity = -Infinity;
  return {
    spans,
    onTranscript(text: string, final: boolean, t: number) {
      const clean = text.trim();
      if (!clean) return;
      lastActivity = t;
      const prevEnd = spans.length ? spans[spans.length - 1].end : 0;
      if (!cur) {
        const words = clean.split(/\s+/).length;
        const lead = final ? Math.min(MAX_LEAD, Math.max(MIN_LEAD, words * MS_PER_WORD)) : 0;
        cur = { start: Math.max(prevEnd, t - lead), text: clean };
      }
      cur.text = clean;
      if (final) {
        spans.push({ start: cur.start, end: Math.max(cur.start, t), text: cur.text });
        cur = null;
      }
    },
    /** Closes a dangling interim utterance (Done pressed before its final arrived). */
    flush(t: number) {
      if (cur) {
        spans.push({ start: cur.start, end: Math.max(cur.start, t), text: cur.text });
        cur = null;
      }
    },
    /** True while words are arriving or an utterance is open. */
    isActive(t: number, quietMs = 1800) {
      return cur !== null || t - lastActivity < quietMs;
    },
    hasPending: () => cur !== null,
  };
}

export type AlignOptions = {
  /** Slack around an utterance: pointing often starts just before and trails just after the words. */
  padMs?: number;
  /** A shape needs this much hover time inside the window to count as a target. */
  minDwellMs?: number;
  /** A lasso made up to this long before an utterance still belongs to it (same as page Narrate). */
  lassoLeadMs?: number;
  maxTargets?: number;
};

/** Hover time per shape id inside [from, to]; each path sample holds until the next one. */
export function dwellByShape(path: PathPoint[], from: number, to: number, endT: number): Map<string, { ms: number; first: number }> {
  const out = new Map<string, { ms: number; first: number }>();
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (!p.id) continue;
    const next = i + 1 < path.length ? path[i + 1].t : endT;
    const a = Math.max(p.t, from);
    const b = Math.min(next, to);
    if (b <= a) continue;
    const e = out.get(p.id);
    if (e) e.ms += b - a;
    else out.set(p.id, { ms: b - a, first: a });
  }
  return out;
}

/**
 * Links each utterance to the shapes pointed at while it was spoken: lassos first (each used once, for the
 * first utterance that follows it), then hovered shapes by first appearance. When nothing dwelled long enough,
 * the longest-hovered shape still counts so a quick point is not lost.
 */
export function alignUtterances(
  spans: SpeechSpan[],
  path: PathPoint[],
  lassos: LassoMark[],
  endT: number,
  opts: AlignOptions = {},
): Utterance[] {
  const { padMs = 300, minDwellMs = 150, lassoLeadMs = 4000, maxTargets = 8 } = opts;
  const used = new Set<number>();
  return spans.map((span) => {
    const ids: string[] = [];
    const push = (id: string) => {
      if (!ids.includes(id) && ids.length < maxTargets) ids.push(id);
    };
    lassos.forEach((l, i) => {
      if (used.has(i)) return;
      if (l.t >= span.start - lassoLeadMs && l.t <= span.end) {
        used.add(i);
        l.ids.forEach(push);
      }
    });
    const dwell = dwellByShape(path, span.start - padMs, span.end + padMs, endT);
    const hits = [...dwell.entries()].sort((a, b) => a[1].first - b[1].first);
    const strong = hits.filter(([, v]) => v.ms >= minDwellMs);
    if (strong.length) strong.forEach(([id]) => push(id));
    else if (hits.length && !ids.length) push([...hits].sort((a, b) => b[1].ms - a[1].ms)[0][0]);
    return { ...span, targetIds: ids };
  });
}
