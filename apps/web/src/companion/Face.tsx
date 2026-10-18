import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "motion/react";
import { duration, ease, spring } from "../ui/motion";
import { expApproach } from "../ghost/spring";
import { getCompanionLevel } from "./bus";
import type { FaceKind } from "./machine";

/** Orb diameter in px. */
export const ORB = 56;

/**
 * Pip's materials. Theme-aware with the same selectors as index.css (the two dark blocks must match):
 * layered radial gradients in neutrals plus a hint of the accent, an inner highlight and a soft rim.
 */
export const PIP_CSS = `
.pip-orb{--o-hi:rgba(255,255,255,.95);--o-a:#fdfdfd;--o-b:#e9eaec;--o-bounce:color-mix(in srgb,var(--color-accent) 11%,transparent);--o-edge:rgba(20,28,48,.09);--o-rim:rgba(255,255,255,.9);--o-under:rgba(60,70,95,.14);--o-drop:rgba(20,28,48,.1);--o-contact:rgba(20,24,36,.34)}
@media (prefers-color-scheme:dark){html[data-theme="system"] .pip-orb,html:not([data-theme]) .pip-orb{--o-hi:rgba(255,255,255,.2);--o-a:#3d3e42;--o-b:#222324;--o-bounce:color-mix(in srgb,var(--color-accent) 18%,transparent);--o-edge:rgba(255,255,255,.09);--o-rim:rgba(255,255,255,.16);--o-under:rgba(0,0,0,.45);--o-drop:rgba(0,0,0,.4);--o-contact:rgba(0,0,0,.55)}}
html[data-theme="dark"] .pip-orb{--o-hi:rgba(255,255,255,.2);--o-a:#3d3e42;--o-b:#222324;--o-bounce:color-mix(in srgb,var(--color-accent) 18%,transparent);--o-edge:rgba(255,255,255,.09);--o-rim:rgba(255,255,255,.16);--o-under:rgba(0,0,0,.45);--o-drop:rgba(0,0,0,.4);--o-contact:rgba(0,0,0,.55)}
.pip-orb-body{background:radial-gradient(58% 46% at 33% 20%,var(--o-hi),transparent 72%),radial-gradient(85% 70% at 68% 96%,var(--o-bounce),transparent 72%),radial-gradient(110% 110% at 38% 28%,var(--o-a),var(--o-b) 100%);box-shadow:inset 0 1px 1px var(--o-rim),inset 0 -5px 9px var(--o-under),0 0 0 1px var(--o-edge),0 6px 16px -6px var(--o-drop)}
.pip-contact{background:radial-gradient(closest-side,var(--o-contact),transparent)}
.pip-dot{background:radial-gradient(circle at 35% 28%,color-mix(in srgb,var(--color-accent) 55%,#fff),var(--color-accent) 70%);box-shadow:0 0 0 1px var(--o-edge),0 2px 6px -1px color-mix(in srgb,var(--color-accent) 45%,transparent)}
`;

const HAPPY: FaceKind[] = ["done", "celebrate"];
/** States in which the eyes follow the pointer. */
const FOLLOW: FaceKind[] = ["idle", "listening", "hearing", "cancelled"];

/** Fixed gaze by state: down-left to write, up-right to think. */
const GAZE: Partial<Record<FaceKind, { x: number; y: number }>> = {
  noting: { x: -2.4, y: 2.6 },
  thinking: { x: 2.6, y: -2.4 },
  error: { x: 0, y: 1.2 },
  confused: { x: 1.2, y: -0.6 },
};

const EYE_L = 20;
const EYE_R = 36;
const EYE_Y = 26.5;
const RX = 2.7;
const RY = 4;

/** Vertical eye scale (1 = resting). Transform-only, so blinks never trigger SVG layout. */
export function eyeScale(face: FaceKind, side: "l" | "r", blink: boolean): number {
  if (blink) return 0.1;
  switch (face) {
    case "cancelled":
      return 0.18;
    case "thinking":
      return 0.48;
    case "noting":
      return 0.82;
    case "hearing":
      return 1.14;
    case "listening":
      return 1.06;
    case "error":
      return 0.8;
    case "confused":
      return side === "l" ? 1.15 : 0.72;
    default:
      return 1;
  }
}

function eyeRot(face: FaceKind, side: "l" | "r"): number {
  if (face === "error") return side === "l" ? -10 : 10;
  if (face === "confused") return side === "l" ? 0 : -6;
  return 0;
}

export function Face({ face, nod, reduced }: { face: FaceKind; nod: number; reduced: boolean }) {
  const look = useRef<SVGGElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const pointer = useRef({ x: 0, y: 0, moved: false });
  const [blink, setBlink] = useState(false);
  const listening = face === "listening" || face === "hearing";
  const follows = !reduced && FOLLOW.includes(face);
  const nodCtl = useAnimationControls();

  useEffect(() => {
    if (reduced || nod === 0) return;
    void nodCtl.start({ y: [0, 1.6, 0], transition: { duration: 0.2, ease: ease.standard } });
  }, [nod, reduced, nodCtl]);

  // Blink every 3-6s while calm; a quick double blink now and then.
  useEffect(() => {
    if (reduced || !(face === "idle" || face === "listening")) return;
    let t: ReturnType<typeof setTimeout>;
    const once = (next: () => void) => {
      setBlink(true);
      t = setTimeout(() => {
        setBlink(false);
        next();
      }, 120);
    };
    const loop = () => {
      t = setTimeout(
        () => {
          const double = Math.random() < 0.2;
          once(() => {
            if (double) t = setTimeout(() => once(loop), 140);
            else loop();
          });
        },
        3000 + Math.random() * 3200,
      );
    };
    loop();
    return () => clearTimeout(t);
  }, [face, reduced]);

  // Gaze follow and the mic ring share one rAF loop. It runs continuously only while listening;
  // otherwise it wakes on pointer movement and sleeps again once the eyes have settled.
  useEffect(() => {
    const g = look.current;
    const r = ring.current;
    if (!follows) {
      if (g) {
        g.style.transition = "transform 220ms cubic-bezier(0.2, 0, 0, 1)";
        g.style.transform = "translate(0px, 0px)";
      }
      if (r && !listening) r.style.opacity = "0";
      if (!listening || reduced) return;
    }
    if (g) g.style.transition = "none";
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
    let raf = 0;
    let x = 0;
    let y = 0;
    let last = 0;
    let running = false;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) {
        last = 0;
        return;
      }
      const dt = last ? (t - last) / 1000 : 1 / 60;
      last = t;
      let settled = true;
      if (follows) {
        const tx = pointer.current.moved ? Math.max(-1, Math.min(1, (pointer.current.x - cx) / 300)) * 2.8 : 0;
        const ty = pointer.current.moved ? Math.max(-1, Math.min(1, (pointer.current.y - cy) / 300)) * 1.8 : 0;
        x = expApproach(x, tx, dt, 0.08);
        y = expApproach(y, ty, dt, 0.08);
        settled = Math.abs(x - tx) < 0.02 && Math.abs(y - ty) < 0.02;
        if (g) g.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      }
      if (r && listening) {
        const lv = getCompanionLevel();
        const live = Date.now() - lv.at < 600;
        const level = live ? lv.level : 0.35 + 0.25 * Math.sin(t / 340);
        r.style.opacity = String((0.25 + 0.6 * level).toFixed(3));
        r.style.transform = `scale(${(1 + 0.14 * level).toFixed(3)})`;
        settled = false;
      }
      if (settled) {
        cancelAnimationFrame(raf);
        running = false;
      }
    };
    const wake = () => {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY, moved: true };
      measure();
      wake();
    };
    if (follows) window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    wake();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", measure);
    };
  }, [follows, listening, reduced]);

  const happy = HAPPY.includes(face);
  const gaze = GAZE[face] ?? { x: 0, y: 0 };
  const dur = reduced ? 0.15 : duration.base;
  const eyeSpring = reduced ? { duration: 0.15 } : spring.snappy;
  const eyeShown = happy ? 0 : 1;
  const thinking = face === "thinking";

  return (
    <motion.div animate={nodCtl} className="relative" style={{ width: ORB, height: ORB }}>
      <span
        ref={ring}
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-[5px] rounded-full border-[1.5px] border-accent ${reduced && listening ? "opacity-70" : "opacity-0"}`}
      />
      {thinking && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[7px]"
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "linear" }}
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className="absolute inset-0" style={{ transform: `rotate(${i * 120}deg)` }}>
              <span
                className="absolute left-1/2 top-0 block -translate-x-1/2 rounded-full bg-accent"
                style={{ width: 6 - i, height: 6 - i, opacity: 1 - i * 0.3 }}
              />
            </span>
          ))}
        </motion.span>
      )}
      <svg viewBox={`0 0 ${ORB} ${ORB}`} width={ORB} height={ORB} aria-hidden="true" className="relative block">
        <g ref={look}>
          <motion.g initial={false} animate={{ x: gaze.x, y: gaze.y }} transition={eyeSpring}>
            {(["l", "r"] as const).map((side) => {
              const cx = side === "l" ? EYE_L : EYE_R;
              return (
                <motion.ellipse
                  key={side}
                  cx={cx}
                  cy={EYE_Y}
                  rx={RX}
                  ry={RY}
                  className="fill-ink"
                  initial={false}
                  animate={{ scaleY: eyeScale(face, side, blink), opacity: eyeShown, rotate: eyeRot(face, side) }}
                  style={{ transformOrigin: `${cx}px ${EYE_Y}px` }}
                  transition={blink ? { duration: 0.06, ease: ease.standard } : eyeSpring}
                />
              );
            })}
            <motion.g initial={false} animate={{ opacity: happy ? 1 : 0, scale: happy ? 1 : 0.85 }} transition={{ duration: dur }} style={{ transformOrigin: "28px 27px" }}>
              <path d={`M${EYE_L - 3.6} 29 Q${EYE_L} 22.6 ${EYE_L + 3.6} 29`} className="fill-none stroke-ink" strokeWidth={2} strokeLinecap="round" />
              <path d={`M${EYE_R - 3.6} 29 Q${EYE_R} 22.6 ${EYE_R + 3.6} 29`} className="fill-none stroke-ink" strokeWidth={2} strokeLinecap="round" />
            </motion.g>
          </motion.g>
        </g>
      </svg>
    </motion.div>
  );
}
