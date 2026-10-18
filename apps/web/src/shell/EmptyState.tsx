import { motion } from "motion/react";
import { fadeUp, listStagger, useReducedMotionSafe } from "../ui/motion";

/** Empty-state hint about lifting from any website. Ways of working live in the Go fan. */
export function EmptyState() {
  const { v } = useReducedMotionSafe();
  return (
    <motion.div variants={v(listStagger)} initial="hidden" animate="show" className="mt-6 flex flex-col items-center gap-4" data-testid="empty-state">
      <motion.p variants={v(fadeUp)} className="text-[12px] leading-4 tracking-[0.01em] text-ink-2">
        Hold <kbd className="rounded-sm border border-line px-1 font-sans text-ink">⌥ Option</kbd> on any website to lift a table, chart or list into an app.
      </motion.p>
    </motion.div>
  );
}
