/**
 * The one motion system (DESIGN.md "Motion"). Every animated surface in the chrome takes its
 * durations, easings, springs and variants from here, so timing is identical everywhere.
 *
 * Rules: animate transform, opacity and clip-path only (never width, height, top or left, except the
 * single side-panel slot, see AppShell). Add `will-change` only while a transition runs. Use layout
 * animations or clip-path instead of animating height. Reduced motion collapses every transition to
 * an instant opacity change (`useReducedMotionSafe`).
 */
import { useMemo } from "react";
import { useReducedMotion, type Transition, type Variants } from "motion/react";

/** Durations in seconds. fast = hover and press, base = menus and popovers, slow = panels and pages. */
export const duration = { fast: 0.12, base: 0.2, slow: 0.32 } as const;

/** Cubic-bezier easings. standard = most moves, emphasized = entrances, exit = leaving. */
export const ease = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.3, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** Springs. snappy = controls and pills, gentle = panels and cards, bouncy = the Go fan and arrivals. */
export const spring = {
  snappy: { type: "spring", stiffness: 520, damping: 38 },
  gentle: { type: "spring", stiffness: 260, damping: 30 },
  bouncy: { type: "spring", stiffness: 420, damping: 22 },
} as const satisfies Record<string, Transition>;

/** Gap between siblings in a staggered list, in seconds. */
export const STAGGER = 0.024;

/** Rows beyond this index share one delay, so a long list never feels slow. */
export const STAGGER_CAP = 12;

/** Delay for the index-th item of a staggered list. */
export const staggerDelay = (index: number, step: number = STAGGER): number => Math.min(index, STAGGER_CAP) * step;

const tween = (d: number, e: readonly [number, number, number, number]): Transition => ({ duration: d, ease: e });

/** Opacity-only transition used when the user asks for reduced motion. */
export const instant: Transition = { duration: duration.fast, ease: ease.standard };

/** Fade in with an 8px rise. Thread items, cards, lifted-app blocks. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: tween(duration.base, ease.emphasized) },
  exit: { opacity: 0, y: 4, transition: tween(duration.fast, ease.exit) },
};

/** Fade in from 96% scale. Cards, the QR card, toasts. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: spring.gentle },
  exit: { opacity: 0, scale: 0.98, transition: tween(duration.fast, ease.exit) },
};

/** Menu or popover: scales from its trigger. Pair with `originFor`, which sets transform-origin. */
export const popover: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { ...tween(duration.base, ease.emphasized), opacity: tween(duration.fast, ease.standard) } },
  exit: { opacity: 0, scale: 0.97, transition: tween(duration.fast, ease.exit) },
};

/** Side panel body: slides in from the right edge while it fades. */
export const panelSlide: Variants = {
  hidden: { opacity: 0, x: 24 },
  show: { opacity: 1, x: 0, transition: { ...spring.gentle, opacity: tween(duration.base, ease.standard) } },
  exit: { opacity: 0, x: 16, transition: tween(duration.base, ease.exit) },
};

/** Parent variants that stagger their children by 24ms. Children use `fadeUp` or any variant with the same keys. */
export const listStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER, delayChildren: 0.02 } },
  exit: { transition: { staggerChildren: STAGGER / 2, staggerDirection: -1 } },
};

/**
 * Shared-axis step transition (onboarding). `custom` is the direction: 1 forward, -1 back. The
 * outgoing step moves 24px against travel, the incoming step arrives from 24px ahead.
 */
export const sharedAxis: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
  center: { opacity: 1, x: 0, transition: { ...spring.gentle, opacity: tween(duration.base, ease.standard) } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -24, transition: tween(duration.fast, ease.exit) }),
};

/** Fade only. Backdrops and overlays. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: tween(duration.base, ease.standard) },
  exit: { opacity: 0, transition: tween(duration.fast, ease.exit) },
};

/** transform-origin for a menu that opens on `side` of its trigger, aligned `align`. */
export function originFor(side: "up" | "down", align: "left" | "right" = "left"): string {
  return `${side === "up" ? "bottom" : "top"} ${align}`;
}

/** Duration (ms) of the longest motion, for code that has to wait for an exit to finish. */
export const SLOW_MS = Math.round(duration.slow * 1000);

/**
 * Reduced-motion helper. `reduce` is true when the user asked for less motion. `t(transition)`
 * returns the transition unchanged, or an instant fade when reduced. `v(variants)` strips every
 * x, y, scale and pathLength from a variants object and keeps opacity only.
 */
export function useReducedMotionSafe() {
  const reduce = !!useReducedMotion();
  return useMemo(
    () => ({
      reduce,
      t: (tr: Transition): Transition => (reduce ? instant : tr),
      v: (variants: Variants): Variants => (reduce ? opacityOnly(variants) : variants),
    }),
    [reduce],
  );
}

type Target = Record<string, unknown>;

/** Keep only `opacity` in each variant target; resolves function variants with direction 0. */
export function opacityOnly(variants: Variants): Variants {
  const out: Variants = {};
  for (const [key, value] of Object.entries(variants)) {
    const target = (typeof value === "function" ? (value as (c: number) => Target)(0) : value) as Target;
    const next: Target = {};
    if ("opacity" in target) next.opacity = target.opacity;
    if (key !== "hidden" && key !== "enter" && target.transition && typeof target.transition === "object" && "staggerChildren" in (target.transition as object)) {
      next.transition = { duration: 0 };
    } else if (key !== "hidden" && key !== "enter") {
      next.transition = instant;
    }
    out[key] = next as Variants[string];
  }
  return out;
}
