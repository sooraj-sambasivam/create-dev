import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "motion/react";
import { duration, ease, spring } from "../ui/motion";
import { expApproach } from "../ghost/spring";
import { getCompanionLevel } from "./bus";
import type { FaceKind } from "./machine";

const MOUTH: Record<FaceKind, string> = {
  idle: "M25 38 Q30 42 35 38",
  listening: "M25 38 Q30 41 35 38",
  hearing: "M26 38 Q30 44 34 38",
  noting: "M26 39 Q30 41 34 39",
  thinking: "M26 40 Q30 40 34 40",
  done: "M22 37 Q30 47 38 37",
  celebrate: "M22 37 Q30 47 38 37",
  confused: "M25 41 Q29 37 35 40",
  error: "M25 42 Q30 37 35 42",
  cancelled: "M26 40 Q30 40 34 40",
};

const HAPPY: FaceKind[] = ["done", "celebrate"];
const TRACK: FaceKind[] = ["listening", "hearing"];

/** Gaze offset by state (eyes look down-left to write, up-right to think). */
const GAZE: Partial<Record<FaceKind, { x: number; y: number }>> = {
  noting: { x: -3, y: 3 },
  thinking: { x: 3, y: -3 },
  error: { x: 0, y: 1 },
};

const EYE_L = 21;
const EYE_R = 39;
const EYE_Y = 26;

const EYE_RY = 4.5;

/** Vertical eye scale (1 = resting). Transform-only, so blinks never trigger SVG layout. */
export function eyeScaleY(face: FaceKind, side: "l" | "r", blink: boolean): number {
  if (face === "cancelled" || blink) return 0.7 / EYE_RY;
  if (face === "hearing") return 5.2 / EYE_RY;
  if (face === "confused") return (side === "l" ? 5.6 : 3.4) / EYE_RY;
  return 1;
}

function eyeRot(face: FaceKind, side: "l" | "r"): number {
  if (face !== "error") return 0;
  return side === "l" ? -12 : 12;
}

export function Face({ face, nod, reduced }: { face: FaceKind; nod: number; reduced: boolean }) {
  const track = useRef<SVGGElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const pointer = useRef({ x: 0, y: 0, moved: false });
  const [blink, setBlink] = useState(false);
  const tracking = !reduced && TRACK.includes(face);
  const staticRing = reduced && TRACK.includes(face);
  const nodCtl = useAnimationControls();

  useEffect(() => {
    if (reduced || nod === 0) return;
    void nodCtl.start({ y: [0, 2, 0], transition: { duration: 0.18, ease: ease.standard } });
  }, [nod, reduced, nodCtl]);

  // Blink every 3.5-6s while calm.
  useEffect(() => {
    if (reduced || !(face === "idle" || face === "listening")) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(
        () => {
          setBlink(true);
          t = setTimeout(() => {
            setBlink(false);
            loop();
          }, 130);
        },
        3500 + Math.random() * 2500,
      );
    };
    loop();
    return () => clearTimeout(t);
  }, [face, reduced]);

  // Eye tracking and the listening ring share one rAF loop that runs only while listening.
  useEffect(() => {
    const g = track.current;
    const r = ring.current;
    if (!tracking) {
      if (g) {
        g.style.transition = "transform 200ms cubic-bezier(0.2, 0, 0, 1)";
        g.style.transform = "translate(0px, 0px)";
      }
      if (r) r.style.opacity = "0";
      return;
    }
    if (g) g.style.transition = "none";
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY, moved: true };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    // The orb is fixed in place, so its box is measured once and on resize, never per frame.
    let cx = 0;
    let cy = 0;
    const measure = () => {
      const box = g?.ownerSVGElement?.getBoundingClientRect();
      if (box) {
        cx = box.left + box.width / 2;
        cy = box.top + box.height / 2;
      }
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    let raf = 0;
    let x = 0;
    let y = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) {
        last = 0;
        return;
      }
      const dt = last ? (t - last) / 1000 : 1 / 60;
      last = t;
      if (pointer.current.moved) {
        const tx = Math.max(-1, Math.min(1, (pointer.current.x - cx) / 320)) * 3;
        const ty = Math.max(-1, Math.min(1, (pointer.current.y - cy) / 320)) * 1.5;
        x = expApproach(x, tx, dt, 0.09);
        y = expApproach(y, ty, dt, 0.09);
      }
      if (g) g.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      if (r) {
        const lv = getCompanionLevel();
        const live = Date.now() - lv.at < 600;
        const level = live ? lv.level : 0.35 + 0.25 * Math.sin(t / 260);
        r.style.opacity = String(0.3 + 0.6 * level);
        r.style.transform = `scale(${1 + 0.16 * level})`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", measure);
    };
  }, [tracking]);

  const happy = HAPPY.includes(face);
  const gaze = GAZE[face] ?? { x: 0, y: 0 };
  const dur = reduced ? 0.15 : duration.base;
  const eyeSpring = reduced ? { duration: 0.15 } : spring.snappy;
  const eyeShown = happy ? 0 : 1;
  const brows = face === "error" || face === "confused";

  return (
    <motion.div animate={nodCtl} className="relative size-[60px]">
      <span
        ref={ring}
        className={`pointer-events-none absolute -inset-1 rounded-full border-2 border-accent ${staticRing ? "opacity-70" : "opacity-0"}`}
      />
      <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true" className="relative block">
        <g ref={track}>
          <motion.g animate={{ x: gaze.x, y: gaze.y }} transition={eyeSpring}>
            <motion.ellipse
              cx={EYE_L}
              cy={EYE_Y}
              rx={3}
              ry={EYE_RY}
              className="fill-ink"
              initial={false}
              animate={{ scaleY: eyeScaleY(face, "l", blink), opacity: eyeShown, rotate: eyeRot(face, "l") }}
              style={{ transformOrigin: `${EYE_L}px ${EYE_Y}px` }}
              transition={blink ? { duration: 0.06, ease: ease.standard } : eyeSpring}
            />
            <motion.ellipse
              cx={EYE_R}
              cy={EYE_Y}
              rx={3}
              ry={EYE_RY}
              className="fill-ink"
              initial={false}
              animate={{ scaleY: eyeScaleY(face, "r", blink), opacity: eyeShown, rotate: eyeRot(face, "r") }}
              style={{ transformOrigin: `${EYE_R}px ${EYE_Y}px` }}
              transition={blink ? { duration: 0.06, ease: ease.standard } : eyeSpring}
            />
            <motion.g initial={false} animate={{ opacity: happy ? 1 : 0 }} transition={{ duration: dur }}>
              <path d="M17.5 28.5 Q21 21.5 24.5 28.5" className="fill-none stroke-ink" strokeWidth={2} strokeLinecap="round" />
              <path d="M35.5 28.5 Q39 21.5 42.5 28.5" className="fill-none stroke-ink" strokeWidth={2} strokeLinecap="round" />
            </motion.g>
          </motion.g>
        </g>
        <motion.g initial={false} animate={{ opacity: brows ? 1 : 0 }} transition={{ duration: dur }}>
          <path
            d={face === "confused" ? "M16 20 L25 20" : "M16 20 L25 16.5"}
            className="fill-none stroke-ink-2"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <path
            d={face === "confused" ? "M35 15.5 L44 14.5" : "M35 16.5 L44 20"}
            className="fill-none stroke-ink-2"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </motion.g>
        <motion.path
          initial={false}
          animate={{ d: MOUTH[face] }}
          transition={{ duration: dur, ease: ease.standard }}
          className="fill-none stroke-ink-2"
          strokeWidth={1.75}
          strokeLinecap="round"
        />
      </svg>
    </motion.div>
  );
}
