import { normalizeWord, type TimedWord } from "@create/shared";

/**
 * Default ASR lags in ms (time from the end of a spoken word until its text reaches us).
 * Measured/researched 2026-10-18 (see scratchpad/sync-research.md):
 *  - Web Speech interim: 300-700 ms after the word ends; default 450.
 *  - Scribe partials: 150-300 ms; default 200.
 *  - Scribe committed words carry exact audio-relative timestamps: lag 0.
 */
export const DEFAULT_LAG_MS = { webspeech: 450, scribePartial: 200, scribeCommitted: 0 } as const;

const MIN_LAG = 50;
const MAX_LAG = 1500;

export interface LagEstimator {
  /** Add one (arrival, true word end) pair directly. */
  addSample(arrivalMs: number, trueEndMs: number): void;
  /**
   * Compare webspeech words (with .arrival) to scribe words for the same speech; aligns by
   * text in order and records lag = arrival - scribe.end for each matched word. Returns pairs used.
   */
  observe(webspeech: readonly TimedWord[], scribe: readonly TimedWord[]): number;
  /** Current estimate (robust median blended with the default prior). */
  lagMs(): number;
  readonly samples: number;
  reset(): void;
}

export function createLagEstimator(defaultLagMs: number = DEFAULT_LAG_MS.webspeech, maxSamples = 40, priorWeight = 3): LagEstimator {
  let xs: number[] = [];
  const clamp = (v: number) => Math.max(MIN_LAG, Math.min(MAX_LAG, v));
  return {
    addSample(arrival, trueEnd) {
      const lag = arrival - trueEnd;
      if (!Number.isFinite(lag) || lag < -100 || lag > 5000) return; // mismatch/outlier
      xs.push(clamp(lag));
      if (xs.length > maxSamples) xs.shift();
    },
    observe(webspeech, scribe) {
      let j = 0;
      let used = 0;
      for (const ws of webspeech) {
        if (ws.arrival === undefined) continue;
        const nw = normalizeWord(ws.text);
        if (!nw) continue;
        for (let k = j; k < Math.min(scribe.length, j + 4); k++) {
          if (normalizeWord(scribe[k].text) === nw) {
            this.addSample(ws.arrival, scribe[k].end);
            j = k + 1;
            used++;
            break;
          }
        }
      }
      return used;
    },
    lagMs() {
      if (!xs.length) return defaultLagMs;
      const s = [...xs].sort((a, b) => a - b);
      const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
      // shrink toward the prior while data is scarce
      return clamp((med * s.length + defaultLagMs * priorWeight) / (s.length + priorWeight));
    },
    get samples() {
      return xs.length;
    },
    reset() {
      xs = [];
    },
  };
}
