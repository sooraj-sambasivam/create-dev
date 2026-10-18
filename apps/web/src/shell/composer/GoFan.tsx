import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { focusRing, ICON, STROKE } from "../../ui/styles";
import { duration, ease, spring, staggerDelay, useReducedMotionSafe } from "../../ui/motion";

/** Gap between fan bubbles launching, wider than a list stagger so the three never overlap in flight. */
const FAN_STAGGER = 0.04;
import { fanOffset, type FanDir } from "./logic";

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

/** Speak, Sketch, Narrate spring out of Go along a radial arc (see fanOffset). */
export function GoFan({ open, items, dir }: { open: boolean; items: FanItem[]; dir: FanDir }) {
  const { reduce } = useReducedMotionSafe();
  const last = items.length - 1;
  return (
    <AnimatePresence>
      {open ? (
        <div key="fan" role="group" aria-label="More ways to start" style={{ display: "contents" }}>
          {/* Invisible disc under the arc, so the pointer never leaves the fan on its way out. */}
          <span aria-hidden="true" className="absolute top-1/2 left-1/2 z-40 size-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
          {items.map((item, index) => {
            const Icon = item.icon;
            const { x, y } = fanOffset(index, dir);
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
                    ? { opacity: 1, transition: { duration: duration.fast } }
                    : {
                        x,
                        y,
                        scale: 1,
                        opacity: 1,
                        transition: { ...spring.bouncy, opacity: { duration: duration.fast, ease: ease.standard, delay: staggerDelay(index, FAN_STAGGER) }, delay: staggerDelay(index, FAN_STAGGER) },
                      }
                }
                exit={
                  reduce
                    ? { opacity: 0, transition: { duration: duration.fast } }
                    : { x: 0, y: 0, scale: 0.4, opacity: 0, transition: { ...spring.snappy, opacity: { duration: duration.fast, ease: ease.exit }, delay: staggerDelay(last - index, FAN_STAGGER / 2) } }
                }
                style={reduce ? { x, y } : undefined}
                className={`group/fan absolute top-1/2 left-1/2 z-50 -mt-4 -ml-4 grid size-8 place-items-center rounded-full border border-line shadow-soft ${focusRing} ${
                  item.active ? "bg-hover text-ink" : "bg-surface text-ink-2 hover:bg-hover hover:text-ink"
                } ${item.disabled || item.ariaDisabled ? "cursor-default opacity-50" : ""}`}
              >
                <Icon size={ICON.md} strokeWidth={STROKE} />
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute ${dir === "left" ? "bottom-full left-1/2 mb-2 -translate-x-1/2" : "top-1/2 left-full ml-2 -translate-y-1/2"} rounded-lg border border-line bg-surface px-2 py-1 text-[14px] leading-4 whitespace-nowrap text-ink shadow-soft opacity-0 transition-opacity duration-120 group-hover/fan:opacity-100 group-focus-visible/fan:opacity-100`}
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
