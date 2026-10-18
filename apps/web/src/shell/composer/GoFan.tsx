import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { focusRing, ICON, STROKE } from "../../ui/styles";
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
  /** Optional: looks clickable and stays clickable, but is announced as disabled; `onClick` still runs. */
  ariaDisabled?: boolean;
  title?: string;
};

/**
 * Speak, Sketch, Narrate spring up into one row above the composer, right-aligned over Go, so they
 * never cover the text field. `rise` is the distance from Go's centre up to the row (see fanRise).
 */
export function GoFan({ open, items, rise }: { open: boolean; items: FanItem[]; rise: number }) {
  const reduce = useReducedMotion();
  const spring = { type: "spring" as const, stiffness: 420, damping: 28 };
  return (
    <AnimatePresence>
      {open ? (
        <div key="fan" role="group" aria-label="More ways to start" style={{ display: "contents" }}>
          {/* Invisible bridge from Go up to the row, so the pointer never leaves the fan on its way. */}
          <span aria-hidden="true" className="absolute bottom-full left-0 z-40 w-8" style={{ height: Math.max(0, rise - 16) }} />
          {items.map((item, index) => {
            const Icon = item.icon;
            const { x, y } = fanOffset(index, rise);
            return (
              <motion.button
                key={item.key}
                type="button"
                aria-label={item.label}
                aria-pressed={item.active}
                data-testid={item.testId}
                onClick={item.onClick}
                disabled={item.disabled}
                aria-disabled={item.ariaDisabled || undefined}
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
                className={`group/fan absolute top-1/2 left-1/2 z-50 -mt-4 -ml-4 grid size-8 place-items-center rounded-full border border-line shadow-soft ${focusRing} ${
                  item.active ? "bg-hover text-ink" : "bg-surface text-ink-2 hover:bg-hover hover:text-ink"
                } ${item.disabled || item.ariaDisabled ? "cursor-default opacity-50" : ""}`}
              >
                <Icon size={ICON.md} strokeWidth={STROKE} />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-lg border border-line bg-surface px-2 py-1 text-[14px] leading-4 whitespace-nowrap text-ink shadow-soft opacity-0 transition-opacity duration-150 group-hover/fan:opacity-100 group-focus-visible/fan:opacity-100"
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
