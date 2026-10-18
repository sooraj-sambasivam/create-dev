import {
  STAGE_BUDGET_MS,
  summarizeCaptureInput,
  type CaptureInput,
  type LocateResponse,
  type LocateResult,
  type LocateSource,
  type StageTiming,
} from "@create/shared";
import { fuse } from "./fuse";
import { readImage } from "./image";
import { locateAx } from "./providers/ax";
import { locateClaude } from "./providers/claude";
import { locateDom } from "./providers/dom";
import { locateGemini } from "./providers/gemini";
import { locateJev } from "./providers/jev";
import { locatePerceptron } from "./providers/perceptron";
import { newTraceId, writeTrace } from "./trace";
import type { ImageCtx, LocateDeps, LocateProvider } from "./types";

/** Network providers cannot meet the 300 ms locate budget alone; these are hard caps, and the grace window handles the rest. */
export const PROVIDER_TIMEOUT_MS: Record<LocateSource, number> = { ax: 50, dom: 50, perceptron: 4000, jev: 2500, gemini: 3500, claude: 8000, fused: 0 };
export const DEFAULT_GRACE_MS = 250;
/** Commit mode lets Perceptron detect run to this cap and waits for it before fusing. */
export const COMMIT_PERCEPTRON_TIMEOUT_MS = 8000;
const HOVER_PIXEL: LocateSource[] = ["jev"];
/** A structural hit at or above this skips the pixel providers entirely (fast path, stays inside the budget). */
export const FAST_PATH_CONFIDENCE = 0.85;

const STRUCTURAL: [LocateSource, LocateProvider][] = [["ax", locateAx], ["dom", locateDom]];
const PIXEL: [LocateSource, LocateProvider][] = [["perceptron", locatePerceptron], ["jev", locateJev], ["gemini", locateGemini]];

interface Run {
  name: LocateSource;
  results: LocateResult[];
  timing: StageTiming;
}

async function run(name: LocateSource, fn: LocateProvider, input: CaptureInput, image: ImageCtx | null, deps: LocateDeps): Promise<Run> {
  const t0 = performance.now();
  const timeoutMs = deps.timeouts?.[name] ?? (deps.mode === "commit" && name === "perceptron" ? COMMIT_PERCEPTRON_TIMEOUT_MS : PROVIDER_TIMEOUT_MS[name]);
  try {
    const results = await fn({ input, image, deps, timeoutMs });
    return { name, results, timing: { stage: "locate", provider: name, ms: Math.round(performance.now() - t0), ok: true } };
  } catch (err) {
    const error = (err instanceof Error ? err.message : "failed").slice(0, 200);
    return { name, results: [], timing: { stage: "locate", provider: name, ms: Math.round(performance.now() - t0), ok: false, error } };
  }
}

/** Resolves when all runs settle, or `graceMs` after the first run that produced candidates. Late runs are recorded as skipped. */
async function settle(runs: Promise<Run>[], names: LocateSource[], graceMs: number): Promise<Run[]> {
  const done = new Map<LocateSource, Run>();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      resolve(
        names.map(
          (n) =>
            done.get(n) ?? {
              name: n,
              results: [],
              timing: { stage: "locate", provider: n, ms: 0, ok: false, error: "skipped: fusion did not wait" },
            },
        ),
      );
    };
    if (runs.length === 0) return finish();
    for (const p of runs)
      p.then((r) => {
        done.set(r.name, r);
        if (done.size === runs.length) finish();
        else if (r.results.length > 0 && !timer) timer = setTimeout(finish, graceMs);
      });
  });
}

/** capture -> locate -> fuse. Always returns a response; every miss carries `ask`. */
export async function locate(input: CaptureInput, allow?: string[], deps: LocateDeps = {}): Promise<LocateResponse> {
  const startedAt = Date.now();
  const stages: StageTiming[] = [];
  const allowed = (n: string) => !allow || allow.includes(n);

  const c0 = performance.now();
  const image = readImage(input);
  stages.push({
    stage: "capture",
    provider: input.source,
    ms: Math.round(performance.now() - c0),
    ok: !input.image || !!image,
    ...(input.image && !image ? { error: "unsupported image data URL" } : {}),
  });

  const all: LocateResult[] = [];
  const structural = await Promise.all(STRUCTURAL.filter(([n]) => allowed(n)).map(([n, f]) => run(n, f, input, image, deps)));
  for (const r of structural) {
    stages.push(r.timing);
    all.push(...r.results);
  }
  const fast = !allow && all.some((r) => r.confidence >= FAST_PATH_CONFIDENCE);

  if (image && !fast) {
    const names = PIXEL.filter(([n]) => allowed(n) && (allow || deps.mode !== "hover" || HOVER_PIXEL.includes(n)) && (allow || n !== "gemini" || deps.mode !== "commit" || !!process.env.GEMINI_API_KEY?.trim()));
    const runs = names.map(([n, f]) => run(n, f, input, image, deps));
    for (const r of await settle(runs, names.map(([n]) => n), deps.graceMs ?? (deps.mode === "commit" ? COMMIT_PERCEPTRON_TIMEOUT_MS + 500 : DEFAULT_GRACE_MS))) {
      stages.push(r.timing);
      all.push(...r.results);
    }
    if (allowed("claude") && deps.mode !== "hover" && !all.some((r) => r.confidence >= 0.4)) {
      const r = await run("claude", locateClaude, input, image, deps);
      stages.push(r.timing);
      all.push(...r.results);
    }
  } else if (!image && !fast && all.length === 0) {
    stages.push({ stage: "locate", provider: "pixels", ms: 0, ok: false, error: input.image ? "unreadable image" : "no image supplied" });
  }

  const f0 = performance.now();
  const outcome = fuse(all, input.cursor, image?.coord ?? input.imageSize);
  stages.push({ stage: "locate", provider: "fuse", ms: Math.round(performance.now() - f0), ok: true });

  const ask = outcome.ask ?? (outcome.result ? undefined : "Which one? Nothing matched.");

  const locateMs = stages.filter((s) => s.stage === "locate").reduce((m, s) => Math.max(m, s.ms), 0);
  const trace = {
    id: newTraceId(),
    startedAt,
    input: summarizeCaptureInput(input),
    stages,
    ...(outcome.result ? { result: outcome.result } : {}),
  };
  if (locateMs > STAGE_BUDGET_MS.locate) {
    // Informational only: the eval harness reads per-provider ms; the budget check stays visible in the trace.
    trace.stages.push({ stage: "locate", provider: "budget", ms: locateMs, ok: false, error: `over ${STAGE_BUDGET_MS.locate}ms budget` });
  }
  if (deps.writeTrace !== false) await writeTrace(trace, deps.traceDir);
  return { result: outcome.result, trace, ...(ask ? { ask } : {}) };
}
