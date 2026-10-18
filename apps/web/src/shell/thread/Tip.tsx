import type { ReactNode } from "react";

/**
 * Tooltip for an icon button. The button keeps its own aria-label; the bubble is decoration, shown on
 * hover (after a short delay) and on keyboard focus. Opacity only, so reduced motion needs nothing.
 */
export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[12px] leading-4 text-surface opacity-0 transition-opacity duration-120 group-hover/tip:opacity-100 group-hover/tip:delay-300 group-focus-within/tip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
