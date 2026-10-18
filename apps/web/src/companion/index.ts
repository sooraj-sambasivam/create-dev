import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Companion } from "./Companion";
import { emitCompanion } from "./bus";

export { emitCompanion, subscribeCompanion, useCompanionEvents, COMPANION_EVENT } from "./bus";
export type { CompanionEvent, CompanionEventType } from "./bus";

let mounted = false;

/** Mounts the companion in its own root on document.body, separate from App. */
export function mountCompanion(): void {
  if (mounted || typeof document === "undefined") return;
  mounted = true;
  const host = document.createElement("div");
  host.id = "create-companion";
  document.body.appendChild(host);
  createRoot(host).render(createElement(Companion));
  if (import.meta.env.DEV) {
    (window as unknown as { __createCompanion?: { emit: typeof emitCompanion } }).__createCompanion = {
      emit: emitCompanion,
    };
  }
}
