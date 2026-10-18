// Pointer path builder. All times are ms on the AUDIO FILE timeline; run.mjs adds tA0.
export const CENTER = Object.fromEntries("ABCDEF".split("").map((id, i) => [id, [170 + 320 * (i % 3), 155 + 300 * Math.floor(i / 3)]]));
export const HOME = [500, 20]; // above the grid: no target
export const HZ = 120;
const STEP = 1000 / HZ;
const smooth = (u) => u * u * (3 - 2 * u);

export class Path {
  constructor(start = HOME, t0 = 0) { this.cur = start; this.t = t0; this.samples = [{ t: t0, x: start[0], y: start[1] }]; this.n = 0; }
  _xy(p) { return typeof p === "string" ? CENTER[p] : p; }
  /** hold (with small deterministic hand jitter) until absolute time t */
  holdUntil(t, jitter = 3) {
    for (let s = this.t + STEP; s <= t + 1e-6; s += STEP) {
      this.n++;
      const jx = jitter * Math.sin(this.n * 0.9) , jy = jitter * Math.cos(this.n * 1.3);
      this.samples.push({ t: s, x: this.cur[0] + jx, y: this.cur[1] + jy });
    }
    this.t = Math.max(this.t, t);
    return this;
  }
  /** cubic-bezier sweep from the current point to target over [t0, t1]; holds until t0 first */
  move(to, t0, t1) {
    to = this._xy(to);
    this.holdUntil(t0);
    const [x0, y0] = this.cur, [x1, y1] = to;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, bend = Math.min(60, len * 0.12);
    const c1 = [x0 + dx * 0.25 + nx * bend, y0 + dy * 0.25 + ny * bend];
    const c2 = [x0 + dx * 0.75 - nx * bend, y0 + dy * 0.75 - ny * bend];
    for (let s = t0 + STEP; s <= t1 + 1e-6; s += STEP) {
      const u = smooth(Math.min(1, (s - t0) / (t1 - t0))), v = 1 - u;
      this.samples.push({
        t: s,
        x: v ** 3 * x0 + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u ** 3 * x1,
        y: v ** 3 * y0 + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u ** 3 * y1,
      });
    }
    this.cur = to; this.t = t1;
    return this;
  }
}
