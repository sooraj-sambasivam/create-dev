import { describe, expect, it } from "vitest";
import { CaptureInputSchema, LocateRequestSchema, LocateResponseSchema, STAGE_BUDGET_MS, summarizeCaptureInput } from "./capture";

const box = { x: 1, y: 2, w: 3, h: 4 };
const ax = (d: number): any => ({ role: "AXGroup", frame: box, ...(d > 0 ? { children: [ax(d - 1)] } : {}) });

describe("capture contract", () => {
  it("accepts a valid input and rejects bad image / deep ax", () => {
    expect(CaptureInputSchema.safeParse({ source: "notch", image: "data:image/png;base64,AAAA", cursor: { x: 1, y: 1 }, ax: ax(3) }).success).toBe(true);
    expect(CaptureInputSchema.safeParse({ source: "notch", image: "http://x" }).success).toBe(false);
    expect(CaptureInputSchema.safeParse({ source: "notch", ax: ax(4) }).success).toBe(false);
    expect(CaptureInputSchema.safeParse({ source: "bogus" }).success).toBe(false);
  });
  it("validates request/response and summary has no image bytes", () => {
    const input = CaptureInputSchema.parse({ source: "extension", image: "data:image/png;base64,AAAA" });
    expect(LocateRequestSchema.safeParse({ input, providers: ["perceptron"] }).success).toBe(true);
    const summary = summarizeCaptureInput(input);
    expect(JSON.stringify(summary)).not.toContain("AAAA");
    const res = { result: null, ask: "Which one?", trace: { id: "t", startedAt: 1, input: summary, stages: [{ stage: "locate", provider: "ax", ms: 5, ok: true }] } };
    expect(LocateResponseSchema.safeParse(res).success).toBe(true);
    expect(STAGE_BUDGET_MS.locate).toBe(300);
  });
});
