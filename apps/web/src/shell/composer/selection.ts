import { findNode, TEXT_FIELD } from "@create/shared";
import type { Screen } from "@create/shared";

/** Label of the selected node ("heading: Welcome"), or null when nothing is selected. */
export function selectedLabel(s: { screen: Screen | null; selectedId: string | null }): string | null {
  if (!s.selectedId || !s.screen) return null;
  const n = findNode(s.screen, s.selectedId);
  if (!n) return null;
  const field = TEXT_FIELD[n.type];
  const raw = field ? (n as Record<string, unknown>)[field] : null;
  const text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!text) return n.type;
  return `${n.type}: ${text.length > 32 ? `${text.slice(0, 31)}…` : text}`;
}
