/** Elapsed time as m:ss, e.g. 0 -> "0:00", 75 -> "1:15". Negative or non-finite input shows 0:00. */
export function formatElapsed(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Clamp a step percentage to an integer in 0..100. Non-finite values become 0. */
export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

/** Progress bar value: 100 once done, otherwise the highest step percentage seen so far. */
export function progressPct(steps: ReadonlyArray<{ pct: number }>, done: boolean): number {
  if (done) return 100;
  return steps.reduce((max, step) => Math.max(max, clampPct(step.pct)), 0);
}
