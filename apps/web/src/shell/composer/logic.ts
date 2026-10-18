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
 * The fan is one row of 32px bubbles with 8px gaps, floating 12px above the composer's top edge and
 * right-aligned over Go, so it never covers the text field. Item 0 sits directly above Go; the rest
 * extend to its left.
 */
export const FAN_BUBBLE = 32;
export const FAN_GAP = 8;
export const FAN_CLEARANCE = 12;
export const FAN_PITCH = FAN_BUBBLE + FAN_GAP;

/** How far above Go's centre the row's centre sits, given Go's and the composer's viewport tops. */
export function fanRise(goTop: number, composerTop: number): number {
  return Math.round(goTop - composerTop + FAN_CLEARANCE + FAN_BUBBLE);
}

/** Offset of bubble `index` from Go's centre. */
export function fanOffset(index: number, rise: number): { x: number; y: number } {
  return { x: index === 0 ? 0 : -index * FAN_PITCH, y: -rise };
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

/** Where a submitted line goes: Chat always asks; Code asks only for questions, otherwise builds or edits. */
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
