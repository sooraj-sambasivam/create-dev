import { useEffect, useLayoutEffect, useReducer, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition } from "motion/react";
import { Check, X } from "lucide-react";
import { useScreenStore } from "../store/screenStore";
import { ICON, STROKE, button, focusRing } from "../ui/styles";
import { duration, ease, fadeUp, spring } from "../ui/motion";
import { Face, ORB, PIP_CSS } from "./Face";
import { NotesCard } from "./NotesCard";
import { activeByEvents, initialState, nextWake, reduce, type FaceKind, type MachineEvent } from "./machine";
import { readPref, writePref, type CompanionPref } from "./prefs";
import { useCompanionSignals } from "./signals";

type Action = { evt: MachineEvent; now: number };
const reducer = (s: ReturnType<typeof reduce>, a: Action) => reduce(s, a.evt, a.now);

type Badge = { glyph: "check" | "?" | "!"; cls: string };
const BADGES: Partial<Record<FaceKind, Badge>> = {
  done: { glyph: "check", cls: "text-ok" },
  celebrate: { glyph: "check", cls: "text-ok" },
  confused: { glyph: "?", cls: "text-warn" },
  error: { glyph: "!", cls: "text-bad" },
};

const ORB_ANIM: Partial<Record<FaceKind, TargetAndTransition>> = {
  thinking: { rotate: 0, x: 0, y: 0, scale: 0.97 },
  confused: { rotate: -9, x: 0, y: 0, scale: 1 },
  celebrate: { rotate: 0, x: 0, y: [0, -8, 0, -4, 0], scale: 1 },
  cancelled: { rotate: 0, x: 0, y: [0, 2.5, 0], scale: 1 },
  error: { rotate: 0, x: [0, -3, 3, -2, 1.5, 0], y: 0, scale: 1 },
  done: { rotate: 0, x: 0, y: 0, scale: [1, 1.06, 1] },
};

/** Faces that play a multi-step keyframe move use a tween; everything else settles on a spring. */
const KEYFRAMED = new Set<FaceKind>(["celebrate", "cancelled", "error", "done"]);
const KEYFRAME_MS: Partial<Record<FaceKind, number>> = { celebrate: 0.7, cancelled: 0.28, error: 0.38, done: 0.34 };

export interface DockRect { left: number; top: number; right: number; bottom: number }
export interface Dock { right: number; bottom: number; collapsed: boolean }

/** Pip's footprint: the 56px orb plus the badge and close button hanging off its corners. */
const PIP = 76;
const DEFAULT_DOCK = { right: 20, bottom: 24 };

const overlaps = (a: DockRect, b: DockRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/**
 * Where Pip sits: just above the composer, at its right edge, on the main card. If that spot would
 * cover an interactive element of the right panel, it collapses to a dot instead of hiding a control.
 * Pure: the caller measures the composer and the panel's interactive elements.
 */
export function computeDock(viewport: { w: number; h: number }, composer: DockRect | null, panelControls: readonly DockRect[]): Dock {
  const pos = composer
    ? { right: Math.max(8, viewport.w - composer.right + 8), bottom: Math.max(8, viewport.h - composer.top + 12) }
    : DEFAULT_DOCK;
  const pip: DockRect = { left: viewport.w - pos.right - PIP, top: viewport.h - pos.bottom - PIP, right: viewport.w - pos.right, bottom: viewport.h - pos.bottom };
  return { ...pos, collapsed: panelControls.some((r) => overlaps(pip, r)) };
}

const INTERACTIVE = "button, a[href], input, select, textarea, [role='button'], [role='tab'], [role='switch'], [tabindex]:not([tabindex='-1'])";

function measureDock(): Dock {
  const rect = (el: Element): DockRect => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const composer = document.querySelector("[data-testid='composer']");
  const controls = Array.from(document.querySelectorAll("[data-right-panel]")).flatMap((p) => Array.from(p.querySelectorAll(INTERACTIVE)).map(rect));
  return computeDock({ w: window.innerWidth, h: window.innerHeight }, composer ? rect(composer) : null, controls.filter((r) => r.right > r.left && r.bottom > r.top));
}

function useDock(): Dock {
  const [dock, setDock] = useState<Dock>({ ...DEFAULT_DOCK, collapsed: false });
  useLayoutEffect(() => {
    const update = () => {
      const next = measureDock();
      setDock((d) => (d.right === next.right && d.bottom === next.bottom && d.collapsed === next.collapsed ? d : next));
    };
    update();
    window.addEventListener("resize", update);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    document.querySelectorAll("[data-testid='composer'], [data-right-panel]").forEach((el) => ro?.observe(el));
    // Panel tabs and cards change without a resize; a light poll keeps the dock honest.
    const id = window.setInterval(update, 600);
    return () => {
      window.removeEventListener("resize", update);
      ro?.disconnect();
      window.clearInterval(id);
    };
  }, []);
  return dock;
}

/** Pip: the Narrate-mode companion. Visual only; the live regions already announce results. */
export function Companion() {
  const mode = useScreenStore((s) => s.mode);
  const reduced = !!useReducedMotion();
  const [pref, setPref] = useState<CompanionPref>(readPref);
  const dock = useDock();
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
  const shown: CompanionPref = pref === "on" && dock.collapsed ? "dot" : pref;
  const badge = BADGES[face];
  const orbAnim: TargetAndTransition =
    ORB_ANIM[face] ??
    (face === "idle" && !reduced
      ? { rotate: 0, x: 0, y: [0, -1.5, 0], scale: 1 }
      : { rotate: 0, x: 0, y: 0, scale: 1 });
  const idleLoop = face === "idle" && !reduced;

  return (
    <div className="pointer-events-none fixed z-40 flex items-end gap-3" style={{ right: dock.right, bottom: dock.bottom }} data-pip-dock={dock.collapsed ? "dot" : "full"}>
      <style>{PIP_CSS}</style>
      <AnimatePresence>
        {visible && shown === "on" && (
          <motion.div
            key="full"
            className="flex flex-col items-end gap-3"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={reduced ? { duration: duration.fast } : undefined}
          >
            <NotesCard notes={state.notes} reduced={reduced} />
            <div className="group pointer-events-none relative" style={{ width: ORB, height: ORB }} data-companion={face}>
              {/* Contact shadow: breathes with the idle float. */}
              <motion.span
                aria-hidden="true"
                className="pip-contact pointer-events-none absolute left-1/2 block h-3 w-10 -translate-x-1/2 rounded-full"
                style={{ bottom: -8 }}
                animate={idleLoop ? { scaleX: [1, 0.9, 1], opacity: [0.9, 0.65, 0.9] } : { scaleX: face === "celebrate" ? 0.75 : 1, opacity: 0.9 }}
                transition={idleLoop ? { duration: 4, repeat: Infinity, ease: "easeInOut" } : spring.gentle}
              />
              <button
                type="button"
                aria-label="Hide companion"
                aria-pressed={false}
                onClick={() => choose("dot")}
                className={`pointer-events-auto relative block rounded-full ${focusRing}`}
                style={{ width: ORB, height: ORB }}
              >
                {!reduced && face === "celebrate" &&
                  [0, 0.18].map((d) => (
                    <motion.span
                      key={`${state.nonce}-${d}`}
                      className="pointer-events-none absolute inset-0 rounded-full border border-accent"
                      initial={{ scale: 1, opacity: 0.45 }}
                      animate={{ scale: 1.8, opacity: 0 }}
                      transition={{ duration: 0.9, delay: d, ease: ease.standard }}
                    />
                  ))}
                <motion.span
                  className="pip-orb pip-orb-body relative flex items-center justify-center rounded-full"
                  style={{ width: ORB, height: ORB }}
                  animate={orbAnim}
                  transition={
                    reduced
                      ? { duration: 0.15 }
                      : idleLoop
                        ? { y: { duration: 4, repeat: Infinity, ease: "easeInOut" }, rotate: spring.gentle, x: spring.gentle, scale: spring.gentle }
                        : KEYFRAMED.has(face)
                          ? { duration: KEYFRAME_MS[face] ?? 0.3, ease: ease.standard }
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
                    className="pointer-events-none absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-line bg-surface text-[12px] font-semibold leading-none shadow-soft"
                    initial={reduced ? { opacity: 0 } : { scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: duration.fast, ease: ease.exit } }}
                    transition={reduced ? { duration: duration.fast } : { ...spring.bouncy, opacity: { duration: duration.fast } }}
                  >
                    {badge.glyph === "check" ? <Check size={ICON.sm - 2} strokeWidth={2.5} className={badge.cls} /> : <span className={badge.cls}>{badge.glyph}</span>}
                  </motion.span>
                )}
              </AnimatePresence>
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
        {visible && shown === "dot" && (
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
              className="pip-orb pip-dot block size-2.5 rounded-full"
              animate={reduced ? undefined : { scale: [1, 1.5, 1] }}
              transition={{ duration: 0.3 }}
            />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
