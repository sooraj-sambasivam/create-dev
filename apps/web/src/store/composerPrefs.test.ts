import { beforeEach, describe, expect, it } from "vitest";
import type { Node, Screen } from "@create/shared";
import {
  applyPending,
  modelEnabled,
  modelLabel,
  requestPrefs,
  sanitizePrefs,
  shouldStage,
  useComposerPrefs,
  type PendingChange,
} from "./composerPrefs";

const heading = (id: string, t: string): Node => ({ id, type: "heading", text: t } as unknown as Node);
const screen = (children: Node[]): Screen => ({ title: "t", children } as unknown as Screen);

describe("model label", () => {
  it("reads name then effort", () => {
    expect(modelLabel("sonnet", "medium")).toBe("Sonnet 5.5 Medium");
    expect(modelLabel("gemini", "high")).toBe("Gemini 3.8 Flash High");
    expect(modelLabel("haiku", "low")).toBe("Haiku 5.5 Low");
  });
});

describe("prefs", () => {
  beforeEach(() => useComposerPrefs.setState({ model: "sonnet", effort: "medium", approve: true, disabled: [] }));

  it("sanitizes junk from storage", () => {
    expect(sanitizePrefs({ model: "gpt", effort: 3, approve: "yes", disabled: ["gemini", "mongo"] })).toEqual({
      model: "sonnet",
      effort: "medium",
      approve: true,
      disabled: ["gemini"],
    });
    expect(sanitizePrefs(null).approve).toBe(true);
    expect(sanitizePrefs({ model: "haiku", effort: "high", approve: false, disabled: [] })).toMatchObject({ model: "haiku", effort: "high", approve: false });
  });

  it("updates model, effort and approve", () => {
    const s = useComposerPrefs.getState();
    s.setModel("haiku");
    s.setEffort("high");
    s.setApprove(false);
    expect(useComposerPrefs.getState()).toMatchObject({ model: "haiku", effort: "high", approve: false });
  });

  it("switching a provider off falls the request back to Sonnet", () => {
    useComposerPrefs.getState().setModel("gemini");
    useComposerPrefs.getState().setProvider("gemini", false);
    expect(modelEnabled("gemini", useComposerPrefs.getState().disabled)).toBe(false);
    expect(requestPrefs(useComposerPrefs.getState())).toEqual({ model: "sonnet", effort: "medium" });
    useComposerPrefs.getState().setProvider("gemini", true);
    expect(requestPrefs(useComposerPrefs.getState()).model).toBe("gemini");
  });

  it("never disables Sonnet or Haiku", () => {
    expect(modelEnabled("sonnet", ["gemini", "inkling"])).toBe(true);
    expect(modelEnabled("haiku", ["gemini", "inkling"])).toBe(true);
  });
});

describe("staging", () => {
  it("stages only when approval is off and a page exists", () => {
    expect(shouldStage({ approve: false, hasScreen: true })).toBe(true);
    expect(shouldStage({ approve: true, hasScreen: true })).toBe(false);
    expect(shouldStage({ approve: false, hasScreen: false })).toBe(false);
  });

  it("applies a node change in place of the target", () => {
    const p: PendingChange = { kind: "node", nodeId: "a", label: "Heading", prompt: "x", summary: "s", nodes: [heading("a2", "New")] };
    const out = applyPending(screen([heading("a", "Old"), heading("b", "Keep")]), p);
    if ("error" in out) throw new Error(out.error);
    expect(out.screen.children.map((n) => n.id)).toEqual(["a2", "b"]);
  });

  it("refuses a node change when the target is gone", () => {
    const p: PendingChange = { kind: "node", nodeId: "gone", label: "Heading", prompt: "x", summary: "s", nodes: [] };
    expect(applyPending(screen([heading("a", "Old")]), p)).toHaveProperty("error");
    expect(applyPending(null, p)).toHaveProperty("error");
  });

  it("applies a page change as the new page", () => {
    const next = screen([heading("z", "Z")]);
    const out = applyPending(screen([heading("a", "A")]), { kind: "page", label: "Whole page", prompt: "x", summary: "s", screen: next });
    expect(out).toEqual({ screen: next });
  });
});
