/** Critically damped-ish spring follower for the agent cursor. Pure, so it can be tested without a DOM. */

export interface Spring1 {
  x: number;
  v: number;
}

export const CURSOR_SPRING = { stiffness: 420, damping: 30 } as const;
const REST_POS = 0.05;
const REST_VEL = 0.5;
const MAX_DT = 1 / 30;
const SUBSTEP = 1 / 240;

/** Advance one spring toward `target` by `dtSec`. Fixed substeps keep it stable at any frame rate. */
export function springStep(s: Spring1, target: number, dtSec: number, k = CURSOR_SPRING): Spring1 {
  let { x, v } = s;
  let left = Math.min(Math.max(dtSec, 0), MAX_DT);
  while (left > 1e-9) {
    const h = Math.min(SUBSTEP, left);
    v += (-k.stiffness * (x - target) - k.damping * v) * h;
    x += v * h;
    left -= h;
  }
  return { x, v };
}

export function atRest(s: Spring1, target: number): boolean {
  return Math.abs(s.x - target) < REST_POS && Math.abs(s.v) < REST_VEL;
}

/** Arrow lean in degrees from horizontal velocity (px/s): leans into the move, capped. */
export function tiltFor(vx: number, maxDeg = 9): number {
  return Math.max(-maxDeg, Math.min(maxDeg, vx / 160));
}

/** Eye follower smoothing: exponential approach that is the same at 30, 60 and 120 fps. */
export function expApproach(current: number, target: number, dtSec: number, tauSec: number): number {
  if (tauSec <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-Math.max(dtSec, 0) / tauSec));
}
