import { create } from "zustand";
import { persist } from "zustand/middleware";
import { findNode, replaceNode, type EffortChoice, type ModelChoice, type Node, type Screen } from "@create/shared";

/** Display names for the composer's model picker. The model name is ink, the effort is ink-3. */
export const MODEL_NAMES: Record<ModelChoice, string> = {
  sonnet: "Sonnet 5.5",
  haiku: "Haiku 5.5",
  inkling: "Inkling",
  gemini: "Gemini 3.8 Flash",
};
/** Second line in the picker rows. */
export const MODEL_NOTES: Record<ModelChoice, string> = {
  sonnet: "Best for building pages",
  haiku: "Fast and light",
  inkling: "Thinking Machines",
  gemini: "Google",
};
export const EFFORT_NAMES: Record<EffortChoice, string> = { low: "Low", medium: "Medium", high: "High" };
export const EFFORTS: readonly EffortChoice[] = ["low", "medium", "high"];
export const MODELS: readonly ModelChoice[] = ["sonnet", "haiku", "inkling", "gemini"];

export const DEFAULT_MODEL: ModelChoice = "sonnet";
export const DEFAULT_EFFORT: EffortChoice = "medium";

/** "Sonnet 5.5 Medium": the picker button text. */
export function modelLabel(model: ModelChoice, effort: EffortChoice): string {
  return `${MODEL_NAMES[model]} ${EFFORT_NAMES[effort]}`;
}

/** Providers the user can switch off from the Plugins popover. Only these change what Create sends. */
export type SwitchableProvider = "gemini" | "inkling";
export const SWITCHABLE: readonly SwitchableProvider[] = ["gemini", "inkling"];

export interface ComposerPrefsData {
  model: ModelChoice;
  effort: EffortChoice;
  /** ON: AI edits apply at once. OFF: edits wait for Apply in a review card. */
  approve: boolean;
  /** Providers turned off in Plugins. A model whose provider is off is never sent. */
  disabled: SwitchableProvider[];
}

interface ComposerPrefsState extends ComposerPrefsData {
  setModel: (m: ModelChoice) => void;
  setEffort: (e: EffortChoice) => void;
  setApprove: (on: boolean) => void;
  setProvider: (p: SwitchableProvider, on: boolean) => void;
}

const isModel = (v: unknown): v is ModelChoice => typeof v === "string" && (MODELS as readonly string[]).includes(v);
const isEffort = (v: unknown): v is EffortChoice => typeof v === "string" && (EFFORTS as readonly string[]).includes(v);

/** Cleans whatever localStorage handed back: unknown values fall to the defaults. */
export function sanitizePrefs(raw: unknown): ComposerPrefsData {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof ComposerPrefsData, unknown>>;
  const disabled = Array.isArray(p.disabled)
    ? SWITCHABLE.filter((s) => (p.disabled as unknown[]).includes(s))
    : [];
  return {
    model: isModel(p.model) ? p.model : DEFAULT_MODEL,
    effort: isEffort(p.effort) ? p.effort : DEFAULT_EFFORT,
    approve: typeof p.approve === "boolean" ? p.approve : true,
    disabled,
  };
}

export const COMPOSER_PREFS_KEY = "create.composerPrefs";

export const useComposerPrefs = create<ComposerPrefsState>()(
  persist(
    (set) => ({
      model: DEFAULT_MODEL,
      effort: DEFAULT_EFFORT,
      approve: true,
      disabled: [],
      setModel: (model) => set({ model }),
      setEffort: (effort) => set({ effort }),
      setApprove: (approve) => set({ approve }),
      setProvider: (p, on) =>
        set((s) => ({ disabled: on ? s.disabled.filter((x) => x !== p) : s.disabled.includes(p) ? s.disabled : [...s.disabled, p] })),
    }),
    {
      name: COMPOSER_PREFS_KEY,
      merge: (persisted, current) => ({ ...current, ...sanitizePrefs(persisted ?? current) }),
      partialize: (s) => ({ model: s.model, effort: s.effort, approve: s.approve, disabled: s.disabled }),
    },
  ),
);

/** A model is usable unless its provider was switched off in Plugins. */
export function modelEnabled(model: ModelChoice, disabled: readonly SwitchableProvider[]): boolean {
  return !(SWITCHABLE as readonly string[]).includes(model) || !disabled.includes(model as SwitchableProvider);
}

/** What a request carries: the picked model, or Sonnet when the pick was switched off. */
export function requestPrefs(p: Pick<ComposerPrefsData, "model" | "effort" | "disabled">): { model: ModelChoice; effort: EffortChoice } {
  return { model: modelEnabled(p.model, p.disabled) ? p.model : DEFAULT_MODEL, effort: p.effort };
}

/** Model + effort for the next request, read from the live store. */
export function currentRequestPrefs(): { model: ModelChoice; effort: EffortChoice } {
  return requestPrefs(useComposerPrefs.getState());
}

// ---- staged AI edits (Approve for me is off) ----

export type PendingChange =
  | { kind: "node"; nodeId: string; label: string; prompt: string; summary: string; nodes: Node[] }
  | { kind: "page"; label: string; prompt: string; summary: string; screen: Screen };

interface PendingState {
  pending: PendingChange | null;
  /** A staged request is still waiting on the model. */
  staging: boolean;
  setPending: (p: PendingChange | null) => void;
  setStaging: (on: boolean) => void;
}

export const usePendingChange = create<PendingState>()((set) => ({
  pending: null,
  staging: false,
  setPending: (pending) => set({ pending }),
  setStaging: (staging) => set({ staging }),
}));

/**
 * Stage only when approval is off and a page already exists to compare against. The first page of a
 * chat has nothing to review, so it applies at once.
 */
export function shouldStage(o: { approve: boolean; hasScreen: boolean }): boolean {
  return !o.approve && o.hasScreen;
}

/** The screen that Apply would produce, or an error when the target element is gone. */
export function applyPending(current: Screen | null, p: PendingChange): { screen: Screen } | { error: string } {
  if (p.kind === "page") return { screen: p.screen };
  if (!current || !findNode(current, p.nodeId)) return { error: "That element was removed, so the change can't apply." };
  return { screen: replaceNode(current, p.nodeId, p.nodes).screen };
}
