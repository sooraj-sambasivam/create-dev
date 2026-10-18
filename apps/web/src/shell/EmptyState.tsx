import { motion } from "motion/react";
import { useScreenStore } from "../store/screenStore";
import { chip, text } from "../ui/styles";
import { fadeUp, listStagger, useReducedMotionSafe } from "../ui/motion";

/** Things people actually want to run, not just look at: each comes with live data or a form. */
const EXAMPLES = [
  "Track weekly orders for my bakery",
  "A sign-up sheet for our club's study nights",
  "Book tutoring sessions by time slot",
];

/** Empty-state helpers: example prompts and a hint about lifting from any website. Ways of working live in the Go fan. */
export function EmptyState() {
  const generate = useScreenStore((s) => s.generate);
  const { v } = useReducedMotionSafe();
  return (
    <motion.div variants={v(listStagger)} initial="hidden" animate="show" className="mt-6 flex flex-col items-center gap-4" data-testid="empty-state">
      <motion.div variants={v(fadeUp)} className="flex flex-wrap justify-center gap-2" role="group" aria-label="Example prompts">
        {EXAMPLES.map((p) => (
          <button key={p} type="button" className={chip.action} onClick={() => void generate(p)}>
            {p}
          </button>
        ))}
      </motion.div>
      <motion.p variants={v(fadeUp)} className={`${text.note} only-paper -rotate-1`} aria-hidden="true">
        or just point at something on your screen
      </motion.p>
      <motion.p variants={v(fadeUp)} className={text.meta}>
        Or hold <kbd className="rounded border border-line px-1 font-sans">⌥ Option</kbd> on any website to lift a table, chart or list into an app.
      </motion.p>
    </motion.div>
  );
}
