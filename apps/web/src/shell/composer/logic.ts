/** Pure helpers for the composer (kept free of React so they are unit-testable). */

/** Matches an "@query" at the end of the text. */
const MENTION_RE = /(^|\s)@([^\s@]*)$/;

/** The text after a trailing "@", or null when the caret context is not a mention. */
export function mentionQuery(value: string): string | null {
  const m = MENTION_RE.exec(value);
  return m ? m[2].toLowerCase() : null;
}

export function filterMentions(names: string[], query: string | null): string[] {
  if (query === null) return [];
  return names.filter((n) => n.toLowerCase().includes(query));
}

/** Replace the trailing "@query" with "@name ". */
export function applyMention(value: string, name: string): string {
  const base = value.replace(MENTION_RE, "$1").trimEnd();
  return `${base ? `${base} ` : ""}@${name} `;
}

/**
 * Arc around Go: three 32px bubbles at an even 45° step on a 76px radius, so every neighbouring pair
 * sits ~58px apart centre to centre (~26px gap). The arc sweeps from above Go out past the
 * composer's right edge, ending just below Go's centre.
 */
export const FAN_RADIUS = 76;
export const FAN_STEP = 45;
export const FAN_ANGLES = [-75, -75 + FAN_STEP, -75 + 2 * FAN_STEP];

export type FanDir = "right" | "left";

/** Horizontal room the arc needs beside Go's centre: radius, half a bubble, and a margin. */
export const FAN_REACH = FAN_RADIUS + 16 + 8;

/** `left` mirrors the arc across Go's vertical axis, for when the right side is clipped or covered. */
export function fanOffset(index: number, dir: FanDir = "right"): { x: number; y: number } {
  const rad = (FAN_ANGLES[index] * Math.PI) / 180;
  const x = Math.round(Math.cos(rad) * FAN_RADIUS);
  return { x: dir === "left" ? -x : x, y: Math.round(Math.sin(rad) * FAN_RADIUS) };
}

/** Prefer the right; mirror left when the right has less than FAN_REACH and the left has more. */
export function pickFanDir(goCenterX: number, rightEdge: number, leftEdge: number): FanDir {
  const right = rightEdge - goCenterX;
  const left = goCenterX - leftEdge;
  return right >= FAN_REACH || right >= left ? "right" : "left";
}

export function placeholderFor(hasScreen: boolean): string {
  return hasScreen ? "Describe a change…" : "Work with Create";
}

/** Auto-grow cap: 16px text, 24px line, 8 lines. */
export const MAX_FIELD_PX = 24 * 8;

/** Mirrors workspaceStore.isBusy: an AI request or transcription may still write into the page. */
export function isStoreBusy(s: { status: string; aiBusyId: string | null | undefined }): boolean {
  return s.status === "loading" || s.status === "transcribing" || (s.aiBusyId ?? null) !== null;
}

const DEICTIC_RE = /\b(this|that|these|those|it|here)\b/i;

/** True when the line points at something ("make this bigger", "swap that photo", "fix it"). */
export function isDeictic(text: string): boolean {
  return DEICTIC_RE.test(text);
}

/** A typed prompt goes to the selected element, not the whole page, when one is selected and the line points at it. */
export function routesToSelection(text: string, selectedId: string | null): boolean {
  return selectedId !== null && isDeictic(text);
}
