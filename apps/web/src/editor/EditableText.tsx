import { useEffect, useRef, type CSSProperties } from "react";
import type { Node } from "@create/shared";
import { useScreenStore } from "../store/screenStore";

interface Props {
  nodeId: string;
  field: string;
  value: string;
  className?: string;
  style?: CSSProperties;
}

/** Shows text normally; becomes an in-place editor when this node is the store's editingId. */
export function EditableText({ nodeId, field, value, className, style }: Props) {
  const editing = useScreenStore((s) => s.editingId === nodeId);
  const ref = useRef<HTMLSpanElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!editing || !el) return;
    cancelled.current = false;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  if (!editing) {
    return (
      <span className={className} style={style}>
        {value}
      </span>
    );
  }

  const finish = () => {
    const text = (ref.current?.innerText ?? "").replace(/\s+/g, " ").trim();
    const store = useScreenStore.getState();
    if (!cancelled.current && text && text !== value) {
      store.patchNode(nodeId, { [field]: text } as Partial<Node>);
    }
    store.setEditing(null);
  };

  return (
    <span
      ref={ref}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      className={`${className ?? ""} pointer-events-auto cursor-text rounded-sm outline-none ring-2 ring-accent ring-offset-1`}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          ref.current?.blur();
        } else if (e.key === "Escape") {
          cancelled.current = true;
          ref.current?.blur();
        }
      }}
      onBlur={finish}
    >
      {value}
    </span>
  );
}
