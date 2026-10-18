/** Pure helpers for the pointer: spoken answers to "Which one?" and which images can be shown to Ask. */

const STOP = new Set(["the", "a", "an", "of", "and", "to", "on", "in", "for", "that", "this", "one"]);
const ORDINALS: Record<string, number> = { first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2, fourth: 3, "4th": 3 };

const tokens = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

function lev1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

/** Same word, a shared 4+ letter prefix ("button"/"buttons"), or one typo in a 5+ letter word. */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return min >= 5 && lev1(a, b);
}

/**
 * Which of the offered labels ("Heading · Welcome", "Button · Buy") a spoken reply names, or null when none or
 * two tie. Label words are fuzzy-matched; "the first one" / "the last one" also work.
 */
export function matchOffered(transcript: string, labels: readonly string[]): number | null {
  const said = tokens(transcript);
  if (said.length === 0 || labels.length === 0) return null;
  const scores = labels.map((l) => {
    const words = tokens(l).filter((w) => !STOP.has(w));
    return words.filter((w) => said.some((s) => sameWord(s, w))).length;
  });
  const best = Math.max(...scores);
  if (best > 0) {
    const at = scores.indexOf(best);
    return scores.lastIndexOf(best) === at ? at : null;
  }
  for (const s of said) {
    if (s in ORDINALS && ORDINALS[s] < labels.length) return ORDINALS[s];
    if (s === "last" && labels.length > 1) return labels.length - 1;
  }
  return null;
}

/** "Pinned · Heading · Ember" */
export const pinnedChip = (label: string) => `Pinned · ${label}`;

/** An image src the page can hand to Ask: inline data, or a same-origin file that a canvas can read back. */
export function classifyImageSrc(src: string, origin: string): "data" | "same-origin" | null {
  if (/^data:image\/(png|jpe?g);/i.test(src)) return "data";
  if (src.startsWith("data:") || src.startsWith("blob:")) return null;
  try {
    return new URL(src, origin).origin === origin ? "same-origin" : null;
  } catch {
    return null;
  }
}

/** Scale (w, h) down to fit `max` on the long side; never up. */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

export const MAX_ASK_IMAGE_CHARS = 1_500_000;
