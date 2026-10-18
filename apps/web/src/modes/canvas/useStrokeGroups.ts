import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Editor, TLShapeId } from "tldraw";
import { BUILT_OPACITY, POPOVER_IDLE_MS, builtGroupsFromShapes, groupReducer, initialGroupState, type GroupState } from "./groups";

export type StrokeGroups = {
  state: GroupState;
  /** True once the pointer has been up for POPOVER_IDLE_MS with an open group. */
  popoverVisible: boolean;
  dismiss: () => void;
  /** Closes the open group as built and fades its strokes. Returns the shape ids that were in it. */
  markBuilt: (label: string) => string[];
  /** Deletes the open group's strokes. */
  discard: () => void;
};

/** Tracks pen strokes into groups: pointer down hides the popover, 600 ms after pointer up it returns. */
export function useStrokeGroups(editor: Editor | null): StrokeGroups {
  const [state, dispatch] = useReducer(groupReducer, initialGroupState);
  const [popoverVisible, setVisible] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupSeq = useRef(0);

  useEffect(() => {
    if (!editor) return;
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    dispatch({
      type: "hydrate",
      built: builtGroupsFromShapes(editor.getCurrentPageShapes().map((s) => ({ id: s.id, meta: s.meta as Record<string, unknown> }))),
    });
    const offStore = editor.store.listen(
      ({ changes }) => {
        for (const rec of Object.values(changes.added)) {
          if (rec.typeName === "shape" && rec.type === "draw" && !(rec.meta as Record<string, unknown>)?.builtGroup) dispatch({ type: "stroke", id: rec.id });
        }
        for (const rec of Object.values(changes.removed)) {
          if (rec.typeName === "shape") dispatch({ type: "remove", id: rec.id });
        }
      },
      { source: "user", scope: "document" },
    );
    const onEvent = (e: { type: string; name?: string }) => {
      if (e.type !== "pointer") return;
      if (e.name === "pointer_down") {
        clear();
        setVisible(false);
      } else if (e.name === "pointer_up") {
        clear();
        timer.current = setTimeout(() => setVisible(stateRef.current.open.length > 0), POPOVER_IDLE_MS);
      }
    };
    editor.on("event", onEvent as never);
    return () => {
      clear();
      offStore();
      editor.off("event", onEvent as never);
    };
  }, [editor]);

  useEffect(() => {
    if (state.open.length === 0) setVisible(false);
  }, [state.open.length]);

  const dismiss = useCallback(() => setVisible(false), []);

  const markBuilt = useCallback(
    (label: string) => {
      const ids = stateRef.current.open;
      if (!editor || !ids.length) return [];
      const groupId = `g${Date.now().toString(36)}${groupSeq.current++}`;
      dispatch({ type: "confirm", groupId, label });
      setVisible(false);
      editor.run(
        () => {
          editor.updateShapes(
            ids.flatMap((id) => {
              const s = editor.getShape(id as TLShapeId);
              return s ? [{ id: s.id, type: s.type, opacity: BUILT_OPACITY, meta: { ...s.meta, builtGroup: groupId, builtLabel: label } }] : [];
            }),
          );
        },
        { history: "ignore" },
      );
      return ids;
    },
    [editor],
  );

  const discard = useCallback(() => {
    const ids = stateRef.current.open as TLShapeId[];
    if (editor && ids.length) editor.deleteShapes(ids);
    dispatch({ type: "discard" });
    setVisible(false);
  }, [editor]);

  return { state, popoverVisible, dismiss, markBuilt, discard };
}
