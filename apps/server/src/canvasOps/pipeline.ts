import { applyOps, ScreenOpsSchema, type CanvasOpsRequest, type CanvasOpsResponse } from "@create/shared";
import { opsWithClaude, type OpsClient } from "./claude";
import { buildMockOps } from "./mock";
import { readSketchWithPerceptron, type PerceptronOptions } from "./perceptron";

export type PipelineDeps = { client?: OpsClient; perceptron?: PerceptronOptions };

export function useMock(): boolean {
  return process.env.MOCK_AI === "1" || !process.env.ANTHROPIC_API_KEY;
}

/** Perceptron reading (optional) then Claude with a forced apply_ops tool; mock when no model is available. */
export async function runCanvasOps(req: CanvasOpsRequest, deps: PipelineDeps = {}): Promise<CanvasOpsResponse> {
  if (useMock() && !deps.client) {
    const { summary, ops } = buildMockOps(req);
    return { summary, ops, provider: "mock" };
  }
  const reading = process.env.MOCK_AI === "1" ? null : await readSketchWithPerceptron(req.image, req.label, deps.perceptron);
  const { summary, ops } = await opsWithClaude(req, reading, deps.client);
  ScreenOpsSchema.parse(ops);
  // Dry run: a result that changes nothing is reported instead of silently returned.
  const dry = applyOps(req.screen, ops);
  const note = dry.skipped.length > 0 ? ` (${dry.skipped.length} of ${ops.length} changes could not be applied)` : "";
  return {
    summary: summary + note,
    ops,
    provider: reading ? "perceptron+claude" : "claude",
    ...(reading ? { sketchReading: reading } : {}),
  };
}
