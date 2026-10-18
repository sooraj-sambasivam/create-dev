import type { DemoChunk, DemoRequest } from "@create/shared";
import type { Node } from "@create/shared";
import { assembleScreen, mockSectionNode } from "./mock";
import { mockPlan, takeId, type Plan } from "./plan";
import { buildSectionWithClaude, planWithClaude, wrapSection } from "./real";

export type Emit = (chunk: DemoChunk) => void | Promise<void>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Pause between mock steps so the UI shows progress (~6s total); zero under test. */
const mockPause = (ms: number) => (process.env.NODE_ENV === "test" || process.env.DEMO_FAST === "1" ? Promise.resolve() : sleep(ms));

/** Max sections built at once on the real path. */
export const DEMO_CONCURRENCY = 3;

export function useMock(): boolean {
  return process.env.MOCK_AI === "1" || !process.env.ANTHROPIC_API_KEY;
}

/** Runs the whole pipeline, emitting step chunks (pct never decreases) and finally a result chunk. */
export async function runDemo(req: DemoRequest, emit: Emit, opts: { mock?: boolean; isAborted?: () => boolean; signal?: AbortSignal } = {}): Promise<void> {
  const mock = opts.mock ?? useMock();
  let last = 0;
  const step = async (label: string, pct: number) => {
    last = Math.max(last, Math.min(99, pct));
    await emit({ type: "step", label, pct: last });
  };
  const aborted = () => (opts.isAborted?.() ?? false) || (opts.signal?.aborted ?? false);

  try {
    await step("Reading your narration", 5);
    if (mock) await mockPause(900);
    await step("Finding what you pointed at", 15);
    if (mock) await mockPause(900);
    await step("Planning sections", 30);

    let plan: Plan;
    let planNote = "";
    if (mock) {
      plan = mockPlan(req.session, req.screen);
      await mockPause(900);
    } else {
      try {
        plan = await planWithClaude(req.session, req.screen, opts.signal);
      } catch (err) {
        if (aborted()) return;
        console.warn("[demo] planner failed, using the local plan:", err instanceof Error ? err.message : "unknown");
        plan = mockPlan(req.session, req.screen);
        planNote = " (planned locally)";
      }
    }
    if (aborted()) return;

    const n = plan.sections.length;
    const built = new Map<string, Node>();
    const taken = new Set<string>(); // ids used by sections built so far
    let accent: string | null | undefined;
    let done = 0;
    const progress = async (label: string) => {
      done++;
      await step(label, 30 + Math.round((60 * done) / n));
    };

    if (mock) {
      for (let i = 0; i < n; i++) {
        const s = plan.sections[i];
        built.set(s.id, mockSectionNode(s, i, takeId(taken, s.id), taken));
        await mockPause(500);
        await progress(`Building ${s.purpose}`);
      }
    } else {
      // At most DEMO_CONCURRENCY sections in flight, so a six-section plan does not hit rate limits.
      let next = 0;
      const worker = async () => {
        while (next < n && !aborted()) {
          const i = next++;
          const s = plan.sections[i];
          try {
            const r = await buildSectionWithClaude(plan, s, i, opts.signal);
            accent ??= r.accent;
            built.set(s.id, wrapSection(s, r.nodes, taken));
            await progress(`Built ${s.purpose}`);
          } catch (err) {
            if (aborted()) return;
            console.warn(`[demo] section "${s.id}" failed, using a simple one:`, err instanceof Error ? err.message : "unknown");
            built.set(s.id, mockSectionNode(s, i, takeId(taken, s.id), taken));
            await progress(`Built ${s.purpose} (simple)`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(DEMO_CONCURRENCY, n) }, worker));
    }
    if (aborted()) return;

    await step("Polishing", 97);
    if (mock) await mockPause(600);
    // Section ids already live in `taken`; assemble against the reused screen's ids.
    const screen = assembleScreen(plan, built, req.screen, accent);
    const summary = `Built "${screen.title}" with ${n} section${n === 1 ? "" : "s"} from your narration${planNote}.`;
    await emit({ type: "result", summary, screen, mock });
  } catch (err) {
    if (aborted()) return;
    console.error("[demo] failed", err instanceof Error ? err.message : "unknown");
    await emit({ type: "error", message: err instanceof Error ? err.message : "Demo generation failed." });
  }
}
