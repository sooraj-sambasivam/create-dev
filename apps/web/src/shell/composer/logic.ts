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

/** Arc around Go. Go's centre sits 32px from the composer's right edge, so the outer bubbles clear that edge by about 8px. */
export const FAN_RADIUS = 72;
export const FAN_ANGLES = [-84, -36, -6];

export function fanOffset(index: number): { x: number; y: number } {
  const rad = (FAN_ANGLES[index] * Math.PI) / 180;
  return { x: Math.round(Math.cos(rad) * FAN_RADIUS), y: Math.round(Math.sin(rad) * FAN_RADIUS) };
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
