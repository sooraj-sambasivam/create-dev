import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { originFor, popover, useReducedMotionSafe } from "../ui/motion";
import type { NodeType } from "@create/shared";
import { useScreenStore } from "../store/screenStore";
import { TYPE_LABELS } from "./EditorContext";
import { PlusIcon } from "./icons";

const ITEMS: { type: NodeType; hint: string }[] = [
  { type: "heading", hint: "A title" },
  { type: "text", hint: "A paragraph" },
  { type: "button", hint: "Something to click" },
  { type: "link", hint: "Text or icon that links" },
  { type: "icon", hint: "Line, cartoon or brand icon" },
  { type: "image", hint: "A photo or your upload" },
  { type: "avatar", hint: "A person's photo" },
  { type: "badge", hint: "A small label" },
  { type: "list", hint: "Bullets or checkmarks" },
  { type: "rating", hint: "Star reviews" },
  { type: "table", hint: "Menu, prices, hours" },
  { type: "chart", hint: "Bars or a line" },
  { type: "accordion", hint: "FAQ questions" },
  { type: "video", hint: "YouTube or Vimeo" },
  { type: "map", hint: "Your address on a map" },
  { type: "textbox", hint: "A field to type in" },
  { type: "checkbox", hint: "A tick box" },
  { type: "select", hint: "Pick from a list" },
  { type: "data", hint: "A value from your backend" },
  { type: "divider", hint: "A line" },
  { type: "spacer", hint: "Empty space" },
  { type: "container", hint: "A box to group things in a row or column" },
];

export function AddMenu() {
  const { v } = useReducedMotionSafe();
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
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const where = selectedType === "container" ? "inside the selected box" : selectedType ? "after the selected element" : "at the end of the page";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-lg bg-hover px-3 text-sm font-medium text-ink transition-colors duration-120 hover:bg-line"
      >
        <PlusIcon /> Add
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Add an element"
            variants={v(popover)}
            initial="hidden"
            animate="show"
            exit="exit"
            style={{ transformOrigin: originFor("down", "right") }}
            className="absolute right-0 top-10 z-50 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-soft"
          >
            <p className="px-2 pb-1.5 pt-1 text-xs text-ink-3">Adds {where}</p>
            {ITEMS.map((item) => (
              <button
                key={item.type}
                type="button"
                role="menuitem"
                onClick={() => {
                  addNode(item.type);
                  setOpen(false);
                }}
                className="flex min-h-8 w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-ink transition-colors duration-120 hover:bg-hover"
              >
                <span>{TYPE_LABELS[item.type]}</span>
                <span className="text-right text-xs text-ink-3">{item.hint}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
