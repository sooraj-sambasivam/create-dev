import { findNode } from "@create/shared";
import { useScreenStore } from "../store/screenStore";
import { TYPE_LABELS } from "./EditorContext";

/** Lowercase label of the selected element ("button", "group"), or null when nothing is selected. */
export function useSelectedLabel(): string | null {
  return useScreenStore((s) => {
    if (!s.editMode || !s.screen || !s.selectedId) return null;
    const node = findNode(s.screen, s.selectedId);
    return node ? TYPE_LABELS[node.type].toLowerCase() : null;
  });
}
