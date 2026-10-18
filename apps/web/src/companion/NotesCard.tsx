import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CircleHelp, NotebookPen, X } from "lucide-react";
import { ICON, STROKE, surface, text } from "../ui/styles";
import { duration, ease, fadeUp, listStagger, spring } from "../ui/motion";
import type { Note, NoteKind } from "./machine";

const ICONS: Record<NoteKind, { Icon: typeof Check; cls: string }> = {
  heard: { Icon: NotebookPen, cls: "text-ink-2" },
  ok: { Icon: Check, cls: "text-ok" },
  ask: { Icon: CircleHelp, cls: "text-warn" },
  bad: { Icon: X, cls: "text-bad" },
};

/** Total time to type a row in. Long lines type faster so nothing takes longer than this. */
export const TYPE_MS = 700;
const MAX_CHAR_MS = 30;

/** How many characters of a `len`-long row are showing `elapsedMs` after it started typing. */
export function typedCount(len: number, elapsedMs: number): number {
  if (len <= 0) return 0;
  const perChar = Math.min(MAX_CHAR_MS, TYPE_MS / len);
  return Math.min(len, Math.floor(elapsedMs / perChar));
}

/**
 * Types the newest row in against the frame clock. The characters are written straight into the text node,
 * so typing never re-renders React, and the row's width stays fixed (it truncates inside a fixed card).
 */
function Typed({ value, animate }: { value: string; animate: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!animate) {
      el.textContent = value;
      return;
    }
    el.textContent = "";
    let raf = 0;
    let t0 = 0;
    const tick = (t: number) => {
      t0 ||= t;
      const n = typedCount(value.length, t - t0);
      el.textContent = value.slice(0, n);
      if (n < value.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, animate]);
  // Reserve the final text for assistive tech and first paint; the effect takes over immediately.
  return <span ref={ref}>{animate ? "" : value}</span>;
}

export function NotesCard({ notes, reduced }: { notes: Note[]; reduced: boolean }) {
  const newest = notes[notes.length - 1]?.id;
  const rowVariants = reduced ? { hidden: { opacity: 0 }, show: { opacity: 1 }, exit: { opacity: 0 } } : fadeUp;
  return (
    <AnimatePresence>
      {notes.length > 0 && (
        <motion.div
          key="notes"
          aria-hidden="true"
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, transition: { duration: duration.fast, ease: ease.exit } }}
          transition={reduced ? { duration: duration.fast } : { ...spring.gentle, opacity: { duration: duration.base, ease: ease.standard } }}
          className={`pointer-events-auto w-[224px] p-3 ${surface.card}`}
        >
          <div className={`mb-1.5 flex items-center gap-1.5 ${text.meta}`}>
            <NotebookPen size={ICON.sm} strokeWidth={STROKE} />
            Notes
          </div>
          <motion.ul className="flex flex-col gap-1.5" variants={reduced ? undefined : listStagger} initial="hidden" animate="show">
            <AnimatePresence>
              {notes.slice(-3).map((n) => {
                const { Icon, cls } = ICONS[n.kind];
                return (
                  <motion.li
                    key={n.id}
                    layout={reduced ? false : "position"}
                    variants={rowVariants}
                    exit="exit"
                    transition={{ layout: spring.gentle }}
                    className="flex items-start gap-2 text-[14px] leading-5 text-ink"
                  >
                    <Icon size={ICON.sm} strokeWidth={STROKE} className={`mt-[3px] shrink-0 ${cls}`} />
                    <span className="line-clamp-2 min-w-0 break-words">
                      <Typed value={n.text} animate={!reduced && n.id === newest} />
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
