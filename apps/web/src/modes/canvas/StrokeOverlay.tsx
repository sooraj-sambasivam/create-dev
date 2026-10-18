import { useEffect, useRef, useState } from "react";
import { useValue, type Editor, type TLShapeId } from "tldraw";
import { Check, Loader2 } from "lucide-react";
import { button, ICON, input, STROKE, surface } from "../../ui/styles";
import { popoverPosition, unionBounds, type BuiltGroup, type Box } from "./groups";

/** Screen-space (tldraw container) box around shapes, or null if none exist. Reactive to camera and shape changes. */
function useScreenBox(editor: Editor, ids: readonly string[]): Box | null {
  return useValue(
    "stroke-group-box",
    () => {
      const boxes: Box[] = [];
      for (const id of ids) {
        const b = editor.getShapePageBounds(id as TLShapeId);
        if (b) boxes.push({ x: b.x, y: b.y, w: b.w, h: b.h });
      }
      const u = unionBounds(boxes);
      if (!u) return null;
      const a = editor.pageToViewport({ x: u.x, y: u.y });
      const z = editor.getZoomLevel();
      return { x: a.x, y: a.y, w: u.w * z, h: u.h * z };
    },
    [editor, ids],
  );
}

/** Label popover under the open stroke group (ported from Inkframe's StrokeGroupPrompt). */
export function StrokePopover({
  editor,
  ids,
  busy,
  onConfirm,
  onDiscard,
  onEscape,
}: {
  editor: Editor;
  ids: readonly string[];
  busy: boolean;
  onConfirm: (label: string) => void;
  onDiscard: () => void;
  onEscape: () => void;
}) {
  const [label, setLabel] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const box = useScreenBox(editor, ids);
  const vp = useValue("viewport", () => editor.getViewportScreenBounds(), [editor]);
  useEffect(() => {
    // Focus after the rise-in starts, so the caret is ready without scrolling the page.
    const raf = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!box) return null;
  const pos = popoverPosition(box, vp.w, vp.h);
  const can = label.trim().length > 0 && !busy;
  const submit = () => {
    if (can) {
      onConfirm(label.trim().slice(0, 500));
      setLabel("");
    }
  };
  return (
    <div
      role="dialog"
      aria-label="Describe what this drawing is"
      className={`canvas-rise-in absolute z-[500] w-[296px] ${surface.card} p-3`}
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onEscape();
      }}
    >
      <label htmlFor="stroke-label" className="mb-1 block text-[12px] text-ink-2">
        What is this?
      </label>
      <textarea
        id="stroke-label"
        ref={input}
        rows={2}
        value={label}
        disabled={busy}
        maxLength={500}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="e.g. hero headline, pricing cards, delete this section"
        className={`${input} h-auto resize-none py-1.5`}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className={button.ghost}
        >
          Discard
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!can}
          className={button.primary}
        >
          {busy && <Loader2 size={ICON.md} strokeWidth={STROKE} className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {busy ? "Building" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

/** Visible outline around a stroke group (open: dashed accent; built: solid, softer). */
export function GroupOutline({ editor, ids, built }: { editor: Editor; ids: readonly string[]; built?: boolean }) {
  const box = useScreenBox(editor, ids);
  if (!box) return null;
  const pad = 6;
  return (
    <div
      aria-hidden
      data-built={built || undefined}
      className="canvas-group-outline pointer-events-none absolute z-[300] rounded-lg"
      style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2 }}
    />
  );
}

function Badge({ editor, group }: { editor: Editor; group: BuiltGroup }) {
  const box = useScreenBox(editor, group.ids);
  if (!box) return null;
  return (
    <div
      className="pointer-events-none absolute z-[400] inline-flex h-6 max-w-[200px] items-center gap-1 rounded-md border border-line bg-surface px-1.5 text-[12px] text-ink-2"
      style={{ left: box.x + box.w, top: box.y, transform: "translate(-100%, -100%)" }}
      title={group.label}
    >
      <Check size={ICON.md} strokeWidth={STROKE} className="shrink-0 text-ok" aria-hidden />
      <span className="truncate">{group.label || "Built"}</span>
    </div>
  );
}

/** A small check badge with the label on each built group. */
export function BuiltBadges({ editor, groups }: { editor: Editor; groups: readonly BuiltGroup[] }) {
  return (
    <>
      {groups.map((g) => (
        <span key={g.id}>
          <GroupOutline editor={editor} ids={g.ids} built />
          <Badge editor={editor} group={g} />
        </span>
      ))}
    </>
  );
}
