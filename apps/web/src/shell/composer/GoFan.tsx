import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { fanOffset } from "./logic";

export type FanItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  testId?: string;
  /** Optional: greys the item out; `title` carries the reason as a tooltip. */
  disabled?: boolean;
  title?: string;
};

/** Mic, Canvas, Narrate spring out along an arc centred on Go, past the composer's right edge. */
export function GoFan({ open, items }: { open: boolean; items: FanItem[] }) {
  const reduce = useReducedMotion();
  const spring = { type: "spring" as const, stiffness: 420, damping: 28 };
  return (
    <AnimatePresence>
      {open ? (
        <div key="fan" role="group" aria-label="More ways to start" style={{ display: "contents" }}>
          {items.map((item, index) => {
            const Icon = item.icon;
            const { x, y } = fanOffset(index);
            return (
              <motion.button
                key={item.key}
                type="button"
                aria-label={item.label}
                aria-pressed={item.active}
                data-testid={item.testId}
                onClick={item.onClick}
                disabled={item.disabled}
                title={item.title}
                initial={reduce ? { opacity: 0 } : { x: 0, y: 0, scale: 0.4, opacity: 0 }}
                animate={
                  reduce
                    ? { opacity: 1, transition: { duration: 0.12 } }
                    : { x, y, scale: 1, opacity: 1, transition: { ...spring, delay: index * 0.035 } }
                }
                exit={
                  reduce
                    ? { opacity: 0, transition: { duration: 0.1 } }
                    : { x: 0, y: 0, scale: 0.4, opacity: 0, transition: { ...spring, delay: (items.length - 1 - index) * 0.035 } }
                }
                style={reduce ? { x, y } : undefined}
                className={`group/fan absolute top-1/2 left-1/2 z-30 -mt-[18px] -ml-[18px] grid h-9 w-9 place-items-center rounded-full border border-[var(--c-line)] shadow-[var(--c-shadow)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-accent)] ${
                  item.active ? "bg-[var(--c-ink)] text-surface" : "bg-[var(--c-surface)] text-[var(--c-ink-2)] hover:bg-[var(--c-hover)]"} ${item.disabled ? "cursor-default opacity-50" : ""
                }`}
              >
                <Icon size={16} strokeWidth={1.75} />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-full ml-2 -translate-y-1/2 rounded-md bg-[var(--c-ink)] px-2 py-1 text-[14px] leading-4 whitespace-nowrap text-surface opacity-0 transition-opacity group-hover/fan:opacity-100 group-focus-visible/fan:opacity-100"
                >
                  {item.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      ) : null}
    </AnimatePresence>
  );
}
