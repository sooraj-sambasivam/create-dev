import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ghostController, type GhostController } from "./controller";

const ACCENT = "var(--accent, #3E7BF0)";
const SURFACE = "var(--surface, #FFFFFF)";
const INK = "var(--ink, #0D0D0D)";
const LINE = "var(--line, #E6E6E6)";
const SHADOW = "0 4px 20px rgba(0,0,0,0.05)";
const Z = 2147483000;

/**
 * The agent cursor: a small arrow with an "Agent" pill, drawn in a portal on
 * document.body so it floats above the app. pointer-events are off, so it never
 * blocks the real cursor.
 */
export function GhostCursor({ controller = ghostController }: { controller?: GhostController }) {
  const s = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const reduce = useReducedMotion();
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-hidden="true"
      data-ghost-root=""
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: Z }}
    >
      <AnimatePresence>
        {s.visible && (
          <motion.div
            key="cursor"
            data-ghost-cursor=""
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            style={{ position: "absolute", left: 0, top: 0, x: s.pos.x, y: s.pos.y }}
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
                animate={{ opacity: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
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
        {s.caption && (
          <motion.div
            key="caption"
            data-ghost-caption=""
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "absolute",
              left: "50%",
              bottom: 24,
              translateX: "-50%",
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
