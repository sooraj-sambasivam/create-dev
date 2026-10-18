/** Pure helpers for as-you-type library search: minimum length, debounce and "most thumbnails failed". */

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_DEBOUNCE_MS = 300;
export const ICON_RETRY_MS = 800;

/** The trimmed term to search for, or null when it is too short. */
export function searchTerm(raw: string): string | null {
  const t = raw.trim();
  return t.length >= SEARCH_MIN_CHARS ? t : null;
}

export type Debounced<A extends unknown[]> = ((...args: A) => void) & { cancel: () => void; flush: () => void };

/** Trailing debounce. `flush` runs the pending call now (used for Enter); `cancel` drops it. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  const run = () => {
    timer = null;
    const a = pending;
    pending = null;
    if (a) fn(...a);
  };
  const d = ((...args: A) => {
    pending = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, ms);
  }) as Debounced<A>;
  d.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  d.flush = () => {
    if (timer) clearTimeout(timer);
    run();
  };
  return d;
}

/** True when at least `minSample` thumbnails have settled and more than half of them failed. */
export function mostFailed(failed: number, total: number, minSample = 4): boolean {
  return total >= minSample && failed * 2 > total;
}
