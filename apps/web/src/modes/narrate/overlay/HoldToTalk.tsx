import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useScreenStore } from "../../../store/screenStore";
import { useWorkMode } from "../../../store/modeStore";
import { usePin } from "../../../narrate/pinStore";
import { HOLD_KEY } from "../../../narrate/keys";
import { createVoice } from "../../../narrate/voice";
import { PointerBubble, type PointerPhase } from "./PointerBubble";
import { answerOffered, runAsk, runPointerCommand, type CommandCtx, type Offered } from "./pointerCommand";
import { usePagePointer } from "./usePagePointer";
import { buildIntentRequest, type HoverHit } from "./targets";

/** Hold this key anywhere to talk to the pointer. Option on macOS (reported as "Alt"). */
export const HOLD_TO_TALK_KEY = HOLD_KEY;
const HOVER_FALLBACK_MS = 1500;
const CLEAR_MS = { done: 2500, failed: 4000, ask: 5000, answer: 12000 } as const;

const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");

/**
 * Hold Option to talk without entering Narrate mode. The pointer target is bound when the key goes down
 * (a pinned element, else what the pointer is on), and listening stops on release. Narrate mode has its own
 * voice, so this stands down there.
 */
export function HoldToTalk() {
  const reduce = useReducedMotion();
  const narrating = useScreenStore((s) => s.mode === "narrate");
  const pointer = usePagePointer(!narrating);
  const [phase, setPhase] = useState<PointerPhase>({ kind: "idle" });
  const [held, setHeld] = useState(false);

  const offered = useRef<Offered | null>(null);
  const bound = useRef<HoverHit | null>(null);

  useEffect(() => {
    if (narrating) return;
    const ctx: CommandCtx = {
      mode: () => useWorkMode.getState().mode,
      setPhase,
      isDone: () => false,
      offer: (o) => { offered.current = o; },
    };
    const onTranscript = (text: string, final: boolean) => {
      const hit = bound.current;
      if (!final) {
        setPhase({ kind: "listening", targetId: hit?.id ?? null, label: hit?.label ?? null });
        return;
      }
      const now = Date.now();
      const picked = answerOffered(offered.current, text, now);
      if (picked) {
        offered.current = null;
        runPointerCommand(ctx, picked.transcript, picked, {});
        return;
      }
      const req = buildIntentRequest(text, null, now, hit);
      if (req) runPointerCommand(ctx, text, req, hit ? { [hit.id]: hit.area } : {});
      else if (ctx.mode() === "chat") void runAsk(ctx, text, { id: null, label: null });
      else setPhase({ kind: "failed", targetId: null, label: null, message: "Point at something first" });
    };
    const voice = createVoice({
      onTranscript,
      onState: (s) => { if (s === "unavailable") setPhase({ kind: "failed", targetId: null, label: null, message: "Microphone unavailable" }); },
    });
    if (!voice.available) return () => voice.destroy();

    const down = (e: KeyboardEvent) => {
      if (e.key !== HOLD_TO_TALK_KEY || e.repeat || editable(e.target)) return;
      // Bind "this" now: the pinned element, else what the pointer is on (or just left).
      const l = pointer.latest();
      bound.current = usePin.getState().pinned ?? (l?.hit && Date.now() - l.t < HOVER_FALLBACK_MS ? l.hit : null);
      setHeld(true);
      setPhase({ kind: "listening", targetId: bound.current?.id ?? null, label: bound.current?.label ?? null });
      voice.start();
    };
    const release = () => {
      setHeld(false);
      voice.stop();
    };
    const up = (e: KeyboardEvent) => { if (e.key === HOLD_TO_TALK_KEY) release(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      voice.destroy();
      setHeld(false);
    };
  }, [narrating, pointer]);

  useEffect(() => {
    if (phase.kind !== "done" && phase.kind !== "failed" && phase.kind !== "ask" && phase.kind !== "answer") return;
    const t = setTimeout(() => setPhase({ kind: "idle" }), CLEAR_MS[phase.kind]);
    return () => clearTimeout(t);
  }, [phase]);

  if (narrating || (!held && phase.kind === "idle")) return null;
  return <PointerBubble pointer={pointer} phase={phase} reduce={reduce} />;
}
