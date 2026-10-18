/** The four things the action card offers on a pointed-at thing. */
export type PointerAction = "understand" | "transform" | "app" | "keep";

export type ActionSpec = { id: PointerAction; title: string; hint: string };

/** First-person verbs, each short enough for a chip. Enter runs the first. */
export const ACTIONS: readonly ActionSpec[] = [
  { id: "understand", title: "Understand", hint: "Explain this to me" },
  { id: "transform", title: "Transform", hint: "Change how this looks or works" },
  { id: "app", title: "Make this a live app I own", hint: "Build it from what I pointed at" },
  { id: "keep", title: "Keep", hint: "Save this to my tray" },
];

/** Moves the highlighted row with the arrow keys, wrapping at both ends. */
export function moveSelection(current: number, key: "ArrowDown" | "ArrowUp", count = ACTIONS.length): number {
  if (count <= 0) return 0;
  return key === "ArrowDown" ? (current + 1) % count : (current - 1 + count) % count;
}

/** What Enter does: the highlighted action. */
export const actionAt = (index: number): ActionSpec => ACTIONS[Math.max(0, Math.min(ACTIONS.length - 1, index))];

/** The note a narration session keeps for an action, so the build knows what was asked. */
export function actionNote(action: PointerAction, label: string): string {
  const what = label || "the pointed-at element";
  switch (action) {
    case "understand": return `Asked what ${what} is.`;
    case "transform": return `Wants to change ${what}.`;
    case "app": return `Wants ${what} made into a live app they own.`;
    case "keep": return `Keeping ${what}.`;
  }
}
