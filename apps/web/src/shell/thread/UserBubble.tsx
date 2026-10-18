import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { ICON, STROKE, focusRing } from "../../ui/styles";
import { spring, useReducedMotionSafe } from "../../ui/motion";

/** Right-aligned prompt bubble. Past eight lines it clamps and offers "Show more". */
export function UserBubble({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const { reduce, t } = useReducedMotionSafe();

  // Only measure while clamped: once open, the toggle stays so the user can fold it back.
  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);

  const toggle = clamped || open;
  return (
    <div className="flex flex-col items-end gap-1">
      <motion.div
        layout={!reduce}
        transition={t(spring.gentle)}
        data-part="user-bubble"
        className="max-w-[70%] rounded-3xl bg-tray px-4 py-2.5 text-[16px] leading-6 text-ink"
      >
        <motion.div
          ref={ref}
          layout={reduce ? false : "position"}
          transition={t(spring.gentle)}
          className={`whitespace-pre-wrap break-words ${open ? "" : "line-clamp-8"}`}
        >
          {text}
        </motion.div>
      </motion.div>
      {toggle && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex h-6 items-center gap-1 rounded-md px-1 text-[12px] text-ink-3 transition-colors duration-120 hover:text-ink ${focusRing}`}
        >
          {open ? "Show less" : "Show more"}
          <ChevronDown size={ICON.sm} strokeWidth={STROKE} aria-hidden className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}
