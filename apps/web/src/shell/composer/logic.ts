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
 * Radial fan around Go: three 32px bubbles at an even 45° step on a 76px radius (~58px between
 * neighbours). It arcs from above Go out past the composer's right edge; when the right side is
 * covered (right panel open) or clipped, it arcs above Go to the left instead.
 */
export const FAN_RADIUS = 76;
export const FAN_STEP = 45;
export const FAN_ANGLES = [-75, -75 + FAN_STEP, -75 + 2 * FAN_STEP];
export const FAN_ANGLES_LEFT = [-75, -75 - FAN_STEP, -75 - 2 * FAN_STEP];
export type FanDir = "right" | "left";

/** Horizontal room the right arc needs beside Go's centre: radius, half a bubble, and a margin. */
export const FAN_REACH = FAN_RADIUS + 16 + 8;

export function fanOffset(index: number, dir: FanDir = "right"): { x: number; y: number } {
  const rad = ((dir === "left" ? FAN_ANGLES_LEFT : FAN_ANGLES)[index] * Math.PI) / 180;
  return { x: Math.round(Math.cos(rad) * FAN_RADIUS), y: Math.round(Math.sin(rad) * FAN_RADIUS) };
}

/** Right unless the free space to Go's right is under FAN_REACH. */
export function pickFanDir(goCenterX: number, rightEdge: number): FanDir {
  return rightEdge - goCenterX >= FAN_REACH ? "right" : "left";
}

export type WorkMode = "chat" | "code";

export function placeholderFor(hasScreen: boolean, mode: WorkMode = "code"): string {
  if (mode === "chat") return "Ask anything, or point and ask";
  return hasScreen ? "Describe a change" : "Describe what to build";
}

const QUESTION_RE = /^\s*(what|why|how|explain|where|when|who|which|is|are|does|do|did|can|could|should|will|would|whats|what's|how's)\b/i;

/** A question ("what does this mean?", "is it responsive") rather than a build or edit request. */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  return t.endsWith("?") || QUESTION_RE.test(t);
}

/** Where a submitted line goes: Chat always asks; Work asks only for questions, otherwise builds or edits. */
export function routeFor(text: string, mode: WorkMode): "ask" | "code" {
  return mode === "chat" || isQuestion(text) ? "ask" : "code";
}

/** The mode a first-run profile starts in. */
export function defaultModeFor(intent: "build" | "ask" | "both"): WorkMode {
  return intent === "ask" ? "chat" : "code";
}

/** Auto-grow cap: 16px text, 24px line, 8 lines. */
export const MAX_FIELD_PX = 24 * 8;

/** Mirrors workspaceStore.isBusy: an AI request or transcription may still write into the page. */
export function isStoreBusy(s: { status: string; aiBusyId: string | null | undefined; asking?: boolean }): boolean {
  return s.asking === true || s.status === "loading" || s.status === "transcribing" || (s.aiBusyId ?? null) !== null;
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
