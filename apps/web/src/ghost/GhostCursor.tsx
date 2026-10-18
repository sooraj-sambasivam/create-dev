import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { duration, ease, spring } from "../ui/motion";
import { ghostController, type GhostController } from "./controller";
import { atRest, expApproach, springStep, tiltFor, type Spring1 } from "./spring";

const ACCENT = "var(--accent, #3E7BF0)";
const SURFACE = "var(--surface, #FFFFFF)";
const INK = "var(--ink, #0D0D0D)";
const LINE = "var(--line, #E6E6E6)";
const SHADOW = "0 4px 20px rgba(0,0,0,0.05)";
const Z = 2147483000;

/**
 * Drives the cursor's transform straight on the DOM node. The controller glides a target along a bezier
 * path; this follows it with a spring (a hair of overshoot on arrival) and leans the arrow into the move.
 * No React render per frame: only transform is written, and the rAF loop sleeps once everything is at rest.
 */
function useCursorMotion(controller: GhostController, reduce: boolean) {
  const place = useRef<HTMLDivElement>(null);
  const lean = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = place.current;
    const arrow = lean.current;
    if (!el) return;
    const start = controller.getPos();
    let target = start;
    let px: Spring1 = { x: start.x, v: 0 };
    let py: Spring1 = { x: start.y, v: 0 };
    let tilt = 0;
    let raf = 0;
    let last = 0;
    const write = () => {
      el.style.transform = `translate3d(${px.x.toFixed(2)}px, ${py.x.toFixed(2)}px, 0)`;
      if (arrow) arrow.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
    };
    write();
    const frame = (t: number) => {
      const dt = last ? (t - last) / 1000 : 1 / 60;
      last = t;
      px = springStep(px, target.x, dt);
      py = springStep(py, target.y, dt);
      tilt = expApproach(tilt, tiltFor(px.v), dt, 0.08);
      write();
      if (atRest(px, target.x) && atRest(py, target.y) && Math.abs(tilt) < 0.05) {
        px = { x: target.x, v: 0 };
        py = { x: target.y, v: 0 };
        tilt = 0;
        write();
        el.style.willChange = "";
        raf = 0;
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    const off = controller.subscribePos((p) => {
      target = p;
      if (reduce) {
        px = { x: p.x, v: 0 };
        py = { x: p.y, v: 0 };
        write();
        return;
      }
      if (!raf) {
        el.style.willChange = "transform";
        raf = requestAnimationFrame(frame);
      }
    });
    return () => {
      off();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [controller, reduce]);
  return { place, lean };
}

/**
 * The agent cursor: a small arrow with an "Agent" pill, drawn in a portal on
 * document.body so it floats above the app. pointer-events are off, so it never
 * blocks the real cursor.
 */
export function GhostCursor({ controller = ghostController }: { controller?: GhostController }) {
  const s = useSyncExternalStore(controller.subscribeUi, controller.getUi, controller.getUi);
  const reduce = !!useReducedMotion();
  const { place, lean } = useCursorMotion(controller, reduce);
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-hidden="true"
      data-ghost-root=""
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: Z }}
    >
      <div ref={place} style={{ position: "absolute", left: 0, top: 0 }}>
        <AnimatePresence>
          {s.visible && (
            <motion.div
              key="cursor"
              data-ghost-cursor=""
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: duration.fast, ease: ease.exit } }}
              transition={reduce ? { duration: duration.fast } : spring.bouncy}
              style={{ position: "absolute", left: 0, top: 0, transformOrigin: "2px 2px" }}
            >
              <div ref={lean} style={{ transformOrigin: "2px 2px" }}>
                <motion.span
                  key={s.rippleKey}
                  initial={s.rippleKey > 0 && !reduce ? { scale: 0.82 } : false}
                  animate={{ scale: 1 }}
                  transition={spring.bouncy}
                  style={{ display: "block", transformOrigin: "2px 2px" }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: "block", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.12))" }}>
                    <path
                      d="M2 1.5 L2 14 L5.6 10.8 L8 16 L10.4 14.9 L8.1 9.8 L13 9.6 Z"
                      fill={SURFACE}
                      stroke={ACCENT}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.span>
              </div>
              <span
                style={{
                  position: "absolute",
                  left: 14,
                  top: 16,
                  font: "500 12px/16px Inter Variable, Inter, system-ui, sans-serif",
                  color: INK,
                  background: SURFACE,
                  border: `1.5px solid ${ACCENT}`,
                  borderRadius: 999,
                  padding: "2px 8px",
                  boxShadow: SHADOW,
                  whiteSpace: "nowrap",
                }}
              >
                Agent
              </span>
              {s.rippleKey > 0 && !reduce && (
                <motion.span
                  key={s.rippleKey}
                  initial={{ opacity: 0.5, scale: 0.2 }}
                  animate={{ opacity: 0, scale: 1.3 }}
                  transition={{ duration: 0.5, ease: ease.standard }}
                  style={{
                    position: "absolute",
                    left: -10,
                    top: -10,
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    border: `2px solid ${ACCENT}`,
                  }}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 24, display: "flex", justifyContent: "center" }}>
        <AnimatePresence>
          {s.caption && (
            <motion.div
              key="caption"
              data-ghost-caption=""
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: duration.fast, ease: ease.exit } }}
              transition={reduce ? { duration: duration.fast } : spring.gentle}
              style={{
                font: "400 14px/20px Inter Variable, Inter, system-ui, sans-serif",
                color: INK,
                background: SURFACE,
                border: `1px solid ${LINE}`,
                borderRadius: 999,
                padding: "8px 16px",
                boxShadow: SHADOW,
                maxWidth: "min(560px, calc(100vw - 32px))",
              }}
            >
              {s.caption}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}

let root: Root | null = null;
let host: HTMLElement | null = null;

/** Mount the cursor once into its own host node. Returns an unmount function. */
export function mountGhost(controller: GhostController = ghostController): () => void {
  if (root) return unmountGhost;
  host = document.createElement("div");
  host.setAttribute("data-ghost-host", "");
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(<GhostCursor controller={controller} />);
  return unmountGhost;
}

export function unmountGhost(): void {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
}
