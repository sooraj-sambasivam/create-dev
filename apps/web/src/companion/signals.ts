import { useEffect, useRef } from "react";
import { useScreenStore } from "../store/screenStore";
import { useWorkMode } from "../store/modeStore";
import { subscribeCompanion, type CompanionEvent } from "./bus";
import type { MachineEvent } from "./machine";

/** Explicit events win: a store-derived event of the same type within this window is dropped. */
const SUPPRESS_MS = 1500;

/**
 * Feeds the machine. Explicit bus events always pass; store-derived fallbacks run only in
 * Narrate mode and are suppressed when an explicit event of that type just arrived.
 */
export function useCompanionSignals(dispatch: (evt: MachineEvent) => void): void {
  const mode = useScreenStore((s) => s.mode);
  const explicit = useRef<Partial<Record<CompanionEvent["type"], number>>>({});
  const send = useRef(dispatch);
  send.current = dispatch;

  useEffect(
    () =>
      subscribeCompanion((evt) => {
        explicit.current[evt.type] = Date.now();
        send.current(evt);
      }),
    [],
  );

  useEffect(() => {
    if (mode !== "narrate") return;
    const fallback = (evt: CompanionEvent) => {
      const at = explicit.current[evt.type];
      if (at !== undefined && Date.now() - at < SUPPRESS_MS) return;
      send.current(evt);
    };
    const first = useScreenStore.getState();
    let prev = first;
    const unsub = useScreenStore.subscribe((s) => {
      const p = prev;
      prev = s;
      const wasBusy = p.status === "loading" || p.asking || p.aiBusyId !== null;
      const busy = s.status === "loading" || s.asking || s.aiBusyId !== null;
      if (busy && !wasBusy) fallback({ type: "thinking" });
      if (s.status === "error" && p.status !== "error") fallback({ type: "error", text: s.error ?? undefined });
      if (s.history.length > p.history.length) {
        const entry = s.history[s.history.length - 1];
        const chat = useWorkMode.getState().mode === "chat";
        fallback({
          type: "done",
          text: entry.summary || (chat ? "Answered" : "Done"),
          label: entry.kind === "element" ? entry.label : undefined,
        });
      }
      if (p.screen && s.screen && p.screen.title !== s.screen.title) fallback({ type: "celebrate" });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Alt" && !e.repeat) fallback({ type: "listening" });
    };
    window.addEventListener("keydown", onKey, { passive: true });
    return () => {
      unsub();
      window.removeEventListener("keydown", onKey);
    };
  }, [mode]);
}
