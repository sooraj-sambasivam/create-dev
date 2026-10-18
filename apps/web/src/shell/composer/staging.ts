import { findNode } from "@create/shared";
import * as api from "../../lib/api";
import { applyPending, usePendingChange } from "../../store/composerPrefs";
import { elementLabel, useScreenStore } from "../../store/screenStore";
import { toast } from "../../ui/toastStore";

/** Ask the model for an element edit and hold the result for review instead of applying it. */
export async function stageNodeEdit(nodeId: string, prompt: string): Promise<void> {
  const { screen, assets } = useScreenStore.getState();
  const node = screen ? findNode(screen, nodeId) : null;
  if (!screen || !node) return;
  const pend = usePendingChange.getState();
  pend.setStaging(true);
  pend.setPending(null);
  try {
    const res = await api.editNode(screen, nodeId, prompt, assets);
    pend.setPending({ kind: "node", nodeId, label: elementLabel(node), prompt, summary: res.summary, nodes: res.nodes });
  } catch (err) {
    toast(err instanceof Error ? err.message : "The AI edit failed.");
  } finally {
    pend.setStaging(false);
  }
}

/** Ask the model to refine the page and hold the new page for review. */
export async function stagePageEdit(prompt: string): Promise<void> {
  const { screen, assets, history } = useScreenStore.getState();
  if (!screen) return;
  const pend = usePendingChange.getState();
  pend.setStaging(true);
  pend.setPending(null);
  try {
    const res = await api.generate(prompt, screen, history.filter((h) => h.kind !== "answer").map((h) => h.prompt), assets);
    pend.setPending({ kind: "page", label: "Whole page", prompt, summary: res.summary, screen: res.screen });
  } catch (err) {
    toast(err instanceof Error ? err.message : "Generation failed.");
  } finally {
    pend.setStaging(false);
  }
}

export function applyPendingChange(): void {
  const { pending, setPending } = usePendingChange.getState();
  if (!pending) return;
  const out = applyPending(useScreenStore.getState().screen, pending);
  if ("error" in out) {
    toast(out.error);
    setPending(null);
    return;
  }
  useScreenStore.getState().setScreen(out.screen, pending.summary);
  setPending(null);
}

export function discardPendingChange(): void {
  usePendingChange.getState().setPending(null);
}
