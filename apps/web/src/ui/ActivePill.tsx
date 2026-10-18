import { motion } from "motion/react";
import { segmented } from "./styles";
import { spring, useReducedMotionSafe } from "./motion";

/**
 * The sliding highlight behind the active item of a segmented control. Render it inside the active
 * item; give every item of one control the same `layoutId` (use `useId()` once per control) and the
 * pill glides from the old item to the new one on a snappy spring. Transform only, never width.
 */
export function ActivePill({ layoutId }: { layoutId: string }) {
  const { reduce } = useReducedMotionSafe();
  return (
    <motion.span
      aria-hidden="true"
      layoutId={layoutId}
      className={segmented.pill}
      style={{ borderRadius: 9999 }}
      transition={reduce ? { duration: 0 } : spring.snappy}
    />
  );
}
