import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useScreenStore } from "../../../store/screenStore";
import { useWorkMode } from "../../../store/modeStore";
import { usePin } from "../../../narrate/pinStore";
import { HOLD_KEY } from "../../../narrate/keys";
import { initialHold, reduceHold, type HoldState } from "../../../narrate/holdToggle";
import { createVoice } from "../../../narrate/voice";
import { PointerBubble, PointerLiveRegion, type PointerPhase } from "./PointerBubble";
import { answerOffered, runAsk, runPointerCommand, type CommandCtx, type Offered } from "./pointerCommand";
import { usePagePointer } from "./usePagePointer";
import { buildIntentRequest, type HoverHit } from "./targets";

/** Hold this key anywhere to talk to the pointer. Option on macOS (reported as "Alt"). */
export const HOLD_TO_TALK_KEY = HOLD_KEY;
const HOVER_FALLBACK_MS = 1500;
const CLEAR_MS = { done: 2500, failed: 4000, ask: 5000, answer: 12000, cancelled: 1500 } as const;
/** A done chip with an Undo button stays this long. */
const UNDO_MS = 5000;
const IN_FLIGHT = new Set<PointerPhase["kind"]>(["listening", "understanding", "editing"]);

const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");

/**
 * Hold Option to talk without entering Narrate mode, or tap it (under 250 ms) to toggle listening on and off.
 * The pointer target is bound when the key goes down (a pinned element, else what the pointer is on), and
 * listening stops on release. Escape cancels listening or a command in flight. Narrate mode has its own
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
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  /** The page as it was when the last edit finished; Undo only applies while it is still current. */
  const doneScreen = useRef<unknown>(null);

  useEffect(() => {
    if (narrating) return;
    let run: AbortController | null = null;
    // Escape sets this so a transcript that is still on its way does not start a command.
    let muted = false;
    const newCtx = (): CommandCtx => {
      run?.abort();
      const ctl = new AbortController();
      run = ctl;
      return {
        mode: () => useWorkMode.getState().mode,
        setPhase: (p) => {
          if (ctl.signal.aborted) return;
          if (p.kind === "done") doneScreen.current = useScreenStore.getState().screen;
          setPhase(p);
        },
        signal: ctl.signal,
        isDone: () => ctl.signal.aborted,
        offer: (o) => { offered.current = o; },
      };
    };
    let hold: HoldState = initialHold;
    const onTranscript = (text: string, final: boolean) => {
      if (muted) return;
      const hit = bound.current;
      if (!final) {
        setPhase({ kind: "listening", targetId: hit?.id ?? null, label: hit?.label ?? null });
        return;
      }
      const ctx = newCtx();
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
      if (e.key === "Escape") { cancel(); return; }
      if (e.key !== HOLD_TO_TALK_KEY || e.repeat || editable(e.target)) return;
      const r = reduceHold(hold, { type: "down", at: e.timeStamp });
      hold = r.state;
      if (r.action !== "start") return;
      muted = false;
      // Bind "this" now: the pinned element, else what the pointer is on (or just left).
      const l = pointer.latest();
      bound.current = usePin.getState().pinned ?? (l?.hit && Date.now() - l.t < HOVER_FALLBACK_MS ? l.hit : null);
      setHeld(true);
      setPhase({ kind: "listening", targetId: bound.current?.id ?? null, label: bound.current?.label ?? null });
      voice.start();
    };
    const release = () => {
      hold = initialHold;
      setHeld(false);
      voice.stop();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== HOLD_TO_TALK_KEY) return;
      const r = reduceHold(hold, { type: "up", at: e.timeStamp });
      hold = r.state;
      if (r.action === "stop") release();
    };
    // Escape: drop listening and abort whatever is in flight. Does nothing (and is not swallowed) when idle.
    const cancel = () => {
      const live = hold.downAt !== null || hold.toggled || IN_FLIGHT.has(phaseRef.current.kind);
      if (!live) return;
      muted = true;
      run?.abort();
      offered.current = null;
      release();
      setPhase({ kind: "cancelled" });
    };
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
    if (phase.kind !== "done" && phase.kind !== "failed" && phase.kind !== "ask" && phase.kind !== "answer" && phase.kind !== "cancelled") return;
    const ms = phase.kind === "done" && phase.undoable ? UNDO_MS : CLEAR_MS[phase.kind];
    const t = setTimeout(() => setPhase({ kind: "idle" }), ms);
    return () => clearTimeout(t);
  }, [phase]);

  const undo = () => {
    const st = useScreenStore.getState();
    if (st.screen === doneScreen.current) st.undo();
    setPhase({ kind: "idle" });
  };

  if (narrating) return null;
  return (
    <>
      <PointerLiveRegion phase={phase} />
      {(held || phase.kind !== "idle") && <PointerBubble pointer={pointer} phase={phase} reduce={reduce} onUndo={undo} />}
    </>
  );
}
