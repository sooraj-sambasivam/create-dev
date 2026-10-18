import { useEffect, useRef } from "react";
import type { PointerPhase } from "../modes/narrate/overlay/PointerBubble";
import { emitCompanion, type CompanionEvent } from "./bus";

/** What Pip should do for a pointer phase. `idle` and in-flight repeats say nothing. */
export function phaseToCompanion(phase: PointerPhase): CompanionEvent | null {
  switch (phase.kind) {
    case "listening":
      return { type: "listening" };
    case "understanding":
    case "editing":
      return { type: "thinking", label: phase.label ?? undefined };
    case "done":
      return { type: "done", text: phase.message, label: phase.label ?? undefined };
    case "answer":
      return { type: "done", text: phase.answer, label: phase.label ?? undefined };
    case "failed":
      return { type: "error", text: phase.message };
    case "ask":
      return { type: "confused", text: phase.message };
    case "cancelled":
      return { type: "cancelled" };
    default:
      return null;
  }
}

/** Mirrors a component's pointer phase into Pip. Only phase kind changes (or a new done/answer) speak. */
export function useCompanionPhase(phase: PointerPhase): void {
  const last = useRef<PointerPhase>({ kind: "idle" });
  useEffect(() => {
    const prev = last.current;
    last.current = phase;
    const evt = phaseToCompanion(phase);
    if (!evt) return;
    // Same kind with the same target is a repeat (listening re-sets on every interim), not news.
    if (prev.kind === phase.kind && phase.kind !== "done" && phase.kind !== "failed" && phase.kind !== "answer" && phase.kind !== "ask") return;
    emitCompanion(evt);
  }, [phase]);
}
