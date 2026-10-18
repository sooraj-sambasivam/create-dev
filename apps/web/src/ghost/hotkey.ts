import { cancelAgentRow, runAgentAddRow } from "./agentRow";

/** Ctrl+Shift+G runs the agent's Add-a-row demo; Escape stops it. Dev builds only (call site gates). */
export function installAgentHotkey(): () => void {
  if (typeof window === "undefined") return () => {};
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === "g") {
      e.preventDefault();
      void runAgentAddRow();
    } else if (e.key === "Escape") cancelAgentRow();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
