import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { NodeType } from "@create/shared";
import { useScreenStore } from "../store/screenStore";
import { TYPE_LABELS } from "./EditorContext";
import { PlusIcon } from "./icons";

const ITEMS: { type: NodeType; hint: string }[] = [
  { type: "heading", hint: "A title" },
  { type: "text", hint: "A paragraph" },
  { type: "button", hint: "Something to click" },
  { type: "textbox", hint: "A field to type in" },
  { type: "image", hint: "A picture" },
  { type: "link", hint: "Text that links" },
  { type: "checkbox", hint: "A tick box" },
  { type: "select", hint: "Pick from a list" },
  { type: "divider", hint: "A line between sections" },
  { type: "container", hint: "A row or column of elements" },
];

export function AddMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const addNode = useScreenStore((s) => s.addNode);
  const selectedType = useScreenStore((s) => {
    if (!s.selectedId || !s.screen) return null;
    let t: string | null = null;
    const walk = (nodes: typeof s.screen.children) =>
      nodes.forEach((n) => {
        if (n.id === s.selectedId) t = n.type;
        if (n.type === "container") walk(n.children);
      });
    walk(s.screen.children);
    return t;
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const where = selectedType === "container" ? "inside the selected group" : selectedType ? "after the selected element" : "at the end of the page";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md bg-indigo-500/90 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-400"
      >
        <PlusIcon /> Add
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 top-8 z-50 w-60 rounded-xl border border-white/10 bg-neutral-900 p-1.5 shadow-2xl"
          >
            <p className="px-2 pb-1 pt-0.5 text-[11px] text-neutral-500">Adds {where}</p>
            {ITEMS.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => {
                  addNode(item.type);
                  setOpen(false);
                }}
                className="flex w-full items-baseline justify-between rounded-lg px-2 py-1.5 text-left text-sm text-neutral-200 hover:bg-white/5"
              >
                <span>{TYPE_LABELS[item.type]}</span>
                <span className="text-[11px] text-neutral-500">{item.hint}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
