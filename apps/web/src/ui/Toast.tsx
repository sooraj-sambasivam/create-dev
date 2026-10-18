import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { ICON, STROKE, surface, text } from "./styles";
import { duration, ease, spring, useReducedMotionSafe } from "./motion";
import { useToasts } from "./toastStore";

/**
 * Bottom-centre toast stack. Each toast rises on a gentle spring and fades out; siblings glide to
 * their new place with a layout animation (transform only). Mount once, in AppShell.
 */
export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const { reduce } = useReducedMotionSafe();
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[150] flex flex-col items-center gap-2 px-4"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout={reduce ? false : "position"}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={reduce ? { duration: duration.fast } : { ...spring.gentle, opacity: { duration: duration.base, ease: ease.standard } }}
            className={`${surface.pill} pointer-events-auto flex h-9 items-center gap-2 px-3 ${text.ui}`}
          >
            <Check size={ICON.md} strokeWidth={STROKE} className="text-ok" aria-hidden />
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
