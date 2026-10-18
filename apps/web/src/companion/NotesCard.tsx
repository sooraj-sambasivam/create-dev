import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CircleHelp, NotebookPen, X } from "lucide-react";
import { ICON, STROKE, surface, text } from "../ui/styles";
import type { Note, NoteKind } from "./machine";

const ICONS: Record<NoteKind, { Icon: typeof Check; cls: string }> = {
  heard: { Icon: NotebookPen, cls: "text-ink-2" },
  ok: { Icon: Check, cls: "text-ok" },
  ask: { Icon: CircleHelp, cls: "text-warn" },
  bad: { Icon: X, cls: "text-bad" },
};

/** Types the newest row in (30ms per character, 700ms at most). */
function Typed({ value, animate }: { value: string; animate: boolean }) {
  const [n, setN] = useState(animate ? 0 : value.length);
  useEffect(() => {
    if (!animate) return;
    const step = Math.max(1, Math.ceil((value.length * 30) / 700));
    const t = setInterval(() => setN((c) => (c >= value.length ? c : Math.min(value.length, c + step))), 30);
    return () => clearInterval(t);
  }, [value, animate]);
  return <>{value.slice(0, n)}</>;
}

export function NotesCard({ notes, reduced }: { notes: Note[]; reduced: boolean }) {
  const newest = notes[notes.length - 1]?.id;
  return (
    <AnimatePresence>
      {notes.length > 0 && (
        <motion.div
          key="notes"
          aria-hidden="true"
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={`pointer-events-auto w-[200px] p-3 ${surface.card}`}
        >
          <div className={`mb-1.5 flex items-center gap-1.5 ${text.meta}`}>
            <NotebookPen size={ICON.sm} strokeWidth={STROKE} />
            Notes
          </div>
          <ul className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {notes.slice(-3).map((n) => {
                const { Icon, cls } = ICONS[n.kind];
                return (
                  <motion.li
                    key={n.id}
                    layout={!reduced}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-start gap-2 text-[14px] leading-5 text-ink"
                  >
                    <Icon size={ICON.sm} strokeWidth={STROKE} className={`mt-[3px] shrink-0 ${cls}`} />
                    <span className="min-w-0 truncate">
                      <Typed value={n.text} animate={!reduced && n.id === newest} />
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
