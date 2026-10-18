import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Editor, TLShapeId } from "tldraw";
import { BUILT_OPACITY, POPOVER_IDLE_MS, builtGroupsFromShapes, clusterByGap, groupReducer, initialGroupState, type GroupState } from "./groups";

export type StrokeGroups = {
  state: GroupState;
  /** The cluster the popover acts on: the open strokes near the latest one (far-apart strokes are separate groups). */
  active: string[];
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

  const active = useMemo(() => {
    const open = state.open;
    if (!editor || open.length < 2) return open;
    const items = open.flatMap((id) => {
      const b = editor.getShapePageBounds(id as TLShapeId);
      return b ? [{ id, box: { x: b.x, y: b.y, w: b.w, h: b.h } }] : [];
    });
    const last = open[open.length - 1];
    return clusterByGap(items).find((c) => c.includes(last)) ?? open;
    // popoverVisible: stroke bounds are final once the pointer has been up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, state.open, popoverVisible]);
  const activeRef = useRef(active);
  activeRef.current = active;

  const dismiss = useCallback(() => setVisible(false), []);

  const markBuilt = useCallback(
    (label: string) => {
      const ids = activeRef.current;
      if (!editor || !ids.length) return [];
      const groupId = `g${Date.now().toString(36)}${groupSeq.current++}`;
      dispatch({ type: "confirm", groupId, label, ids });
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
    const ids = activeRef.current as TLShapeId[];
    if (editor && ids.length) editor.deleteShapes(ids);
    dispatch({ type: "discard", ids });
    setVisible(false);
  }, [editor]);

  return { state, active, popoverVisible, dismiss, markBuilt, discard };
}
