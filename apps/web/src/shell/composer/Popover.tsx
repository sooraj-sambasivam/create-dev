import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const ease = [0.22, 1, 0.36, 1] as const;

export const menuItemClass =
  "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[14px] text-[var(--c-ink)] hover:bg-[var(--c-hover)] focus-visible:bg-[var(--c-hover)] focus-visible:outline-none";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

const ITEMS = "[role^=menuitem]:not([disabled]), button:not([disabled]), input:not([disabled]), [href]";

export function Popover({
  open,
  onClose,
  align = "left",
  side: sideProp = "up",
  children,
  panel,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
  side?: "up" | "down";
  children: ReactNode;
  panel: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  // A "down" menu flips up when the trigger sits near the bottom of the window (docked composer).
  const [flip, setFlip] = useState(false);
  useLayoutEffect(() => {
    if (!open || sideProp !== "down") return;
    const r = ref.current?.getBoundingClientRect();
    if (r) setFlip(window.innerHeight - r.bottom < 280 && r.top > 280);
  }, [open, sideProp]);
  const side = sideProp === "down" && flip ? "up" : sideProp;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      triggerRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Move focus into the first item when the menu opens.
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      const menu = menuRef.current;
      if (!menu || menu.contains(document.activeElement)) return;
      menu.querySelector<HTMLElement>(ITEMS)?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      onClose();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(ITEMS));
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
    items[next].focus();
  };

  const position =
    side === "down"
      ? align === "right" ? "top-full right-0 mt-2" : "top-full left-0 mt-2"
      : align === "right" ? "bottom-full right-0 mb-3" : "bottom-full left-0 mb-3";
  const travel = reduce ? 0 : side === "down" ? -4 : 4;

  return (
    <div ref={ref} className="relative">
      <div ref={triggerRef}>{children}</div>
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={menuRef}
            role="menu"
            onKeyDown={onMenuKeyDown}
            initial={{ opacity: 0, y: travel }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: travel }}
            transition={{ duration: reduce ? 0 : 0.2, ease }}
            className={`absolute z-40 ${wide ? "w-72" : "min-w-56 max-w-72"} max-h-[min(420px,70vh)] overflow-auto rounded-xl border border-[var(--c-line)] bg-[var(--c-surface)] p-1.5 shadow-[var(--c-shadow)] ${position}`}
          >
            {panel}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
