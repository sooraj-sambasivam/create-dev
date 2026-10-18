import { useEffect, useReducer, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition } from "motion/react";
import { CircleHelp, NotebookPen, ThumbsUp, TriangleAlert, X } from "lucide-react";
import { useScreenStore } from "../store/screenStore";
import { ICON, STROKE, button, focusRing, surface } from "../ui/styles";
import { duration, ease, fadeUp, spring } from "../ui/motion";
import { Face } from "./Face";
import { NotesCard } from "./NotesCard";
import { activeByEvents, initialState, nextWake, reduce, type FaceKind, type MachineEvent } from "./machine";
import { readPref, writePref, type CompanionPref } from "./prefs";
import { useCompanionSignals } from "./signals";

type Action = { evt: MachineEvent; now: number };
const reducer = (s: ReturnType<typeof reduce>, a: Action) => reduce(s, a.evt, a.now);

const BADGES: Partial<Record<FaceKind, { Icon: typeof ThumbsUp; cls: string }>> = {
  done: { Icon: ThumbsUp, cls: "text-ok" },
  celebrate: { Icon: ThumbsUp, cls: "text-ok" },
  noting: { Icon: NotebookPen, cls: "text-ink-2" },
  confused: { Icon: CircleHelp, cls: "text-warn" },
  error: { Icon: TriangleAlert, cls: "text-bad" },
};

const ORB_ANIM: Partial<Record<FaceKind, TargetAndTransition>> = {
  thinking: { rotate: 4, y: 0, scale: 1 },
  confused: { rotate: -8, y: 0, scale: 1 },
  celebrate: { rotate: 0, y: [0, -9, 0, -5, 0], scale: 1 },
  cancelled: { rotate: 0, y: [0, 3, 0], scale: 1 },
  done: { rotate: 0, y: 0, scale: 1 },
};

/** Faces that play a multi-step keyframe hop use a tween; everything else settles on a spring. */
const KEYFRAMED = new Set<FaceKind>(["celebrate", "cancelled"]);

/** Pip: the Narrate-mode companion. Visual only; the live regions already announce results. */
export function Companion() {
  const mode = useScreenStore((s) => s.mode);
  const reduced = !!useReducedMotion();
  const [pref, setPref] = useState<CompanionPref>(readPref);
  const [state, dispatch] = useReducer(reducer, initialState);
  useCompanionSignals((evt) => dispatch({ evt, now: Date.now() }));

  useEffect(() => {
    const at = nextWake(state);
    if (at === null) return;
    const t = setTimeout(() => dispatch({ evt: { type: "tick" }, now: Date.now() }), Math.max(0, at - Date.now()) + 5);
    return () => clearTimeout(t);
  }, [state]);

  const visible = pref !== "off" && (mode === "narrate" || activeByEvents(state));
  const choose = (v: CompanionPref) => {
    setPref(v);
    writePref(v);
  };
  const { face } = state;
  const badge = BADGES[face];
  const orbAnim: TargetAndTransition =
    ORB_ANIM[face] ??
    (face === "idle" && !reduced
      ? { rotate: 0, y: 0, scale: [1, 1.02, 1] }
      : { rotate: 0, y: 0, scale: 1 });
  const idleLoop = face === "idle" && !reduced;

  return (
    <div className="pointer-events-none fixed right-5 bottom-6 z-40 flex items-end gap-3">
      <AnimatePresence>
        {visible && pref === "on" && (
          <motion.div
            key="full"
            className="flex items-end gap-3"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={reduced ? { duration: duration.fast } : undefined}
          >
            <NotesCard notes={state.notes} reduced={reduced} />
            <div className="group pointer-events-none relative size-[60px]" data-companion={face}>
              <button
                type="button"
                aria-label="Hide companion"
                aria-pressed={false}
                onClick={() => choose("dot")}
                className={`pointer-events-auto relative block size-[60px] rounded-full border border-line bg-surface shadow-soft ${focusRing}`}
              >
                {!reduced && face === "celebrate" &&
                  [0, 0.18, 0.36].map((d) => (
                    <motion.span
                      key={`${state.nonce}-${d}`}
                      className="pointer-events-none absolute inset-0 rounded-full border border-ink-3"
                      initial={{ scale: 1, opacity: 0.5 }}
                      animate={{ scale: 1.9, opacity: 0 }}
                      transition={{ duration: 0.9, delay: d, ease: ease.standard }}
                    />
                  ))}
                <motion.span
                  className="block rounded-full"
                  animate={orbAnim}
                  transition={
                    reduced
                      ? { duration: 0.15 }
                      : idleLoop
                        ? { scale: { duration: 4, repeat: Infinity, ease: "easeInOut" }, rotate: spring.gentle, y: spring.gentle }
                        : KEYFRAMED.has(face)
                          ? { duration: face === "celebrate" ? 0.7 : 0.28, ease: ease.standard }
                          : spring.gentle
                  }
                >
                  <Face face={face} nod={state.nod} reduced={reduced} />
                </motion.span>
              </button>
              <AnimatePresence>
                {badge && (
                  <motion.span
                    key={`${face}-${state.nonce}`}
                    aria-hidden="true"
                    className={`pointer-events-none absolute -top-2 -right-2 flex size-7 items-center justify-center ${surface.pill}`}
                    initial={reduced ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: duration.fast, ease: ease.exit } }}
                    transition={reduced ? { duration: duration.fast } : { ...spring.bouncy, opacity: { duration: duration.fast } }}
                  >
                    <badge.Icon size={ICON.sm} strokeWidth={STROKE} className={badge.cls} />
                  </motion.span>
                )}
              </AnimatePresence>
              {face === "thinking" && (
                <span aria-hidden="true" className="pointer-events-none absolute top-[66px] left-1/2 flex -translate-x-1/2 gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="size-1.5 rounded-full bg-ink-3"
                      animate={reduced ? { opacity: 0.8 } : { opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </span>
              )}
              <button
                type="button"
                aria-label="Hide companion"
                onClick={() => choose("dot")}
                className={`${button.iconSm} pointer-events-auto absolute -top-3 -left-3 border border-line bg-surface opacity-0 shadow-soft transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100`}
              >
                <X size={12} strokeWidth={STROKE} />
              </button>
            </div>
          </motion.div>
        )}
        {visible && pref === "dot" && (
          <motion.button
            key="dot"
            type="button"
            aria-label="Show companion"
            aria-pressed={true}
            title="Show companion"
            onClick={() => choose("on")}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: duration.fast } : spring.bouncy}
            className={`pointer-events-auto flex size-6 items-center justify-center rounded-full ${focusRing}`}
          >
            <motion.span
              key={state.nonce}
              className="block size-2.5 rounded-full bg-ink-3"
              animate={reduced ? undefined : { scale: [1, 1.5, 1] }}
              transition={{ duration: 0.3 }}
            />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
