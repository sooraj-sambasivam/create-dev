import { useEffect } from "react";
import { findNode } from "@create/shared";
import { useScreenStore } from "../store/screenStore";
import { INLINE_FIELD } from "./EditorContext";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Undo/redo, delete, duplicate, escape, and Enter-to-edit-text for the visual editor. */
export function useEditorShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const s = useScreenStore.getState();
      if (!s.screen || !s.editMode) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        s.redo();
      } else if (mod && key === "d" && s.selectedId) {
        e.preventDefault();
        s.duplicate(s.selectedId);
      } else if ((key === "backspace" || key === "delete") && s.selectedId) {
        e.preventDefault();
        s.remove(s.selectedId);
      } else if (key === "escape") {
        s.select(null);
      } else if (key === "enter" && s.selectedId) {
        const node = findNode(s.screen, s.selectedId);
        if (node && INLINE_FIELD[node.type]) {
          e.preventDefault();
          s.setEditing(node.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
