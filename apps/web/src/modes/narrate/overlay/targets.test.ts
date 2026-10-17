import { describe, expect, it } from "vitest";
import { buildIntentRequest, nodeLabel, overlapFraction } from "./targets";

describe("targets", () => {
  it("labels nodes with type and snippet", () => {
    expect(nodeLabel("button", "  Buy   now ")).toBe("button: Buy now");
    expect(nodeLabel("image", "")).toBe("image");
    expect(nodeLabel("text", "x".repeat(100)).length).toBeLessThan(60);
  });
  it("computes overlap", () => {
    expect(overlapFraction({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 5, h: 10 })).toBe(0.5);
    expect(overlapFraction({ x: 0, y: 0, w: 0, h: 10 }, { x: 0, y: 0, w: 5, h: 10 })).toBe(0);
  });
  it("only builds an intent request within 4s of a lasso", () => {
    const lasso = { t: 1000, targets: [{ id: "n1", label: "button", kind: "node" as const }] };
    expect(buildIntentRequest("make it red", lasso, 4900)?.candidates).toHaveLength(1);
    expect(buildIntentRequest("make it red", lasso, 5100)).toBeNull();
    expect(buildIntentRequest("make it red", null, 1100)).toBeNull();
    expect(buildIntentRequest("  ", lasso, 1100)).toBeNull();
    expect(buildIntentRequest("x", { t: 1000, targets: [] }, 1100)).toBeNull();
  });
});
