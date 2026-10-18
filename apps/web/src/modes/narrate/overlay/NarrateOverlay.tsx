import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { NarrationSession } from "@create/shared";
import { useScreenStore } from "../../../store/screenStore";
import { createRecorder } from "../../../narrate/session";
import { createVoice, DRAIN_TIMEOUT_MS } from "../../../narrate/voice";
import { Lasso, type LassoEvent } from "./Lasso";
import { PointerBubble, type PointerPhase } from "./PointerBubble";
import { usePagePointer } from "./usePagePointer";
import type { MicState } from "./MicPill";
import { NarrateBarView } from "./NarrateBarView";
import {
  askText,
  buildIntentRequest,
  isDeictic,
  LASSO_SPEECH_AFTER_MS,
  LASSO_SPEECH_BEFORE_MS,
  MIN_INTENT_CONFIDENCE,
  preResolve,
  resolvePageTargets,
  type HoverHit,
  type LassoRect,
  type LassoTarget,
} from "./targets";
import type { IntentRequest, IntentResult } from "@create/shared";

export type NarrateOverlayProps = {
  onFinish(session: NarrationSession): void;
  onCancel(): void;
};

export const HINTS = [
  "Feel free to speak",
  "Hold Shift and drag to lasso",
  "Hold Option to talk · double-tap Option to lock",
];

export const POINTER_HINT = "Hover and talk · Shift+drag to select several";

export const BROWSER_SPEECH_HINT = "Using browser speech recognition";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const MAX_EVENTS = 2000;
/** A pointer sample older than this is not "where the user is pointing" any more. */
const HOVER_FALLBACK_MS = 1500;
const PHASE_CLEAR_MS = { done: 2500, failed: 4000, ask: 5000 } as const;

type LassoMemo = { t: number; targets: LassoTarget[]; areas: Record<string, number> };

type Add = (e: Record<string, unknown>) => void;

export function NarrateOverlay({ onFinish, onCancel }: NarrateOverlayProps) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(3);
  // With a page already on screen there is nothing to hide behind a countdown: start listening at once.
  const [recording, setRecording] = useState(() => useScreenStore.getState().screen != null);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [mic, setMic] = useState<MicState>("idle");
  const [micHint, setMicHint] = useState<string | undefined>();
  const [finishing, setFinishing] = useState(false);

  const recorder = useRef<ReturnType<typeof createRecorder> | null>(null);
  const voice = useRef<ReturnType<typeof createVoice> | null>(null);
  const lastLasso = useRef<LassoMemo | null>(null);
  const pointer = usePagePointer(true);
  const [phase, setPhase] = useState<PointerPhase>({ kind: "idle" });
  const phaseRef = useRef<PointerPhase>(phase);
  phaseRef.current = phase;
  /** When the current utterance began (first interim), so "this" binds to where the pointer was then. */
  const utterStart = useRef<number | null>(null);
  /** The latest final line that had nothing to act on yet; a lasso within 4s after it still claims it. */
  const pendingSpeech = useRef<{ t: number; text: string } | null>(null);
  const runCommand = useRef<(text: string, req: IntentRequest, areas: Record<string, number>) => void>(() => {});
  const done = useRef(false);
  const micRef = useRef<MicState>("idle");
  const finalWaiter = useRef<(() => void) | null>(null);
  const cbs = useRef({ onFinish, onCancel });
  cbs.current = { onFinish, onCancel };

  useEffect(() => {
    if (recording) return;
    const t = setTimeout(() => (count > 1 ? setCount(count - 1) : setRecording(true)), 1000);
    return () => clearTimeout(t);
  }, [count, recording]);

  /** The element under the pointer when speech started, else the freshest one the pointer just left. */
  const hoverFor = useCallback((startT: number): HoverHit | null => {
    const at = pointer.resolveAt(startT)?.hit;
    if (at) return at;
    const l = pointer.latest();
    return l?.hit && Date.now() - l.t < HOVER_FALLBACK_MS ? l.hit : null;
  }, [pointer]);

  useEffect(() => {
    if (phase.kind !== "done" && phase.kind !== "failed" && phase.kind !== "ask") return;
    const t = setTimeout(() => setPhase({ kind: "idle" }), PHASE_CLEAR_MS[phase.kind]);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    const rec = createRecorder("page");
    recorder.current = rec;
    const add = rec.add as unknown as Add;
    runCommand.current = (text, req, areas) => {
      const labelOf = (id: string | null) => (id ? req.candidates.find((c) => c.id === id)?.label ?? null : null);
      const fail = (message: string, id: string | null) => setPhase({ kind: "failed", targetId: id, label: labelOf(id), message });
      const pre = preResolve(req, areas);
      const bound = req.pointer?.targetId ?? (pre.kind === "target" ? pre.id : null);
      const tFinal = performance.now();
      setPhase({ kind: "understanding", targetId: bound, label: labelOf(bound) });
      if (bound) add({ kind: "note", text: `Pointing at ${labelOf(bound) ?? bound}; says: ${text}`.slice(0, 4000) });
      void (async () => {
        let intent: IntentResult;
        try {
          const res = await fetch("/api/route-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req),
          });
          if (!res.ok) throw new Error(String(res.status));
          intent = (await res.json()) as IntentResult;
        } catch {
          if (!done.current) fail("Couldn't check that line", bound);
          return;
        }
        if (done.current) return;
        const tIntent = performance.now();
        if (!intent.isCommand) { setPhase({ kind: "idle" }); return; }
        if (intent.confidence < MIN_INTENT_CONFIDENCE) { fail("Not sure what to change", bound); return; }
        // The router's pick wins when it is one of the candidates; "this/that" falls back to the pointer.
        let id = intent.targetId && req.candidates.some((c) => c.id === intent.targetId) ? intent.targetId : null;
        if (!id && isDeictic(text) && pre.kind === "target") id = pre.id;
        if (!id) {
          if (pre.kind === "ask") setPhase({ kind: "ask", message: askText(pre.labels) });
          else if (req.candidates.length > 1) setPhase({ kind: "ask", message: askText(req.candidates.slice(0, 4).map((c) => c.label)) });
          else fail("Point at something first", null);
          return;
        }
        add({ kind: "note", text: `Live command (${intent.action ?? "edit"}) on ${id}: ${text}`.slice(0, 4000) });
        setPhase({ kind: "editing", targetId: id, label: labelOf(id) });
        let result: { error?: string; summary?: string };
        try {
          result = await useScreenStore.getState().editNodeWithAI(id, text);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "Edit failed" };
        }
        const tApplied = performance.now();
        console.info(
          `[pointer] final→intent ${Math.round(tIntent - tFinal)}ms, intent→applied ${Math.round(tApplied - tIntent)}ms, total ${Math.round(tApplied - tFinal)}ms (${intent.action})`,
        );
        if (done.current) return;
        if (result.error) fail(result.error, id);
        else setPhase({ kind: "done", targetId: id, label: labelOf(id), message: result.summary });
      })();
    };
    const onTranscript = (text: string, final: boolean) => {
      setTranscript(text);
      if (!final) {
        if (utterStart.current === null) utterStart.current = Date.now();
        const k = phaseRef.current.kind;
        if (k === "idle" || k === "done" || k === "failed" || k === "ask") {
          const hit = hoverFor(utterStart.current);
          setPhase({ kind: "listening", targetId: hit?.id ?? null, label: hit?.label ?? null });
        }
        return;
      }
      add({ kind: "speech", text, final });
      finalWaiter.current?.();
      const tFinal = Date.now();
      const startT = utterStart.current ?? tFinal;
      utterStart.current = null;
      if (done.current) return;
      const lasso = lastLasso.current;
      const hover = hoverFor(startT);
      const req = buildIntentRequest(text, lasso, tFinal, hover);
      if (!req) {
        // Nothing pointed at yet: a Shift+drag in the next few seconds can still claim this line.
        pendingSpeech.current = { t: tFinal, text };
        setPhase({ kind: "idle" });
        return;
      }
      pendingSpeech.current = null;
      const dt = lasso ? tFinal - lasso.t : Infinity;
      const usedLasso = !!lasso && lasso.targets.length > 0 && dt <= LASSO_SPEECH_AFTER_MS && dt >= -LASSO_SPEECH_BEFORE_MS;
      const areas = usedLasso ? lasso.areas : hover ? { [hover.id]: hover.area } : {};
      if (usedLasso) lastLasso.current = null;
      runCommand.current(text, req, areas);
    };
    const v = createVoice({
      onTranscript,
      onEngine: () => setMicHint(BROWSER_SPEECH_HINT),
      onState: (s) => { micRef.current = s as MicState; setMic(s as MicState); },
    });
    voice.current = v;
    if (!v.available) setMic("unavailable");
    const unbind = v.bindKeys();
    // Dev/test hook: feed a transcript line through the same path the speech engine uses.
    const w = window as unknown as { __createNarrate?: { say(text: string, final?: boolean): void } };
    if (import.meta.env.DEV) w.__createNarrate = { say: (text, final = true) => onTranscript(text, final) };
    return () => {
      if (import.meta.env.DEV) delete w.__createNarrate;
      unbind();
      v.destroy();
    };
  }, []);

  useEffect(() => {
    if (recording && voice.current?.available) voice.current.start();
  }, [recording]);

  useEffect(() => {
    if (!recording) return;
    const t0 = Date.now();
    const i = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(i);
  }, [recording]);

  const finish = useCallback(async () => {
    if (done.current || !recorder.current) return;
    done.current = true;
    setFinishing(true);
    const v = voice.current;
    const wasLive = micRef.current === "listening" || micRef.current === "locked";
    v?.stop();
    if (wasLive) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, DRAIN_TIMEOUT_MS + 200);
        finalWaiter.current = () => { clearTimeout(t); resolve(); };
      });
      finalWaiter.current = null;
    }
    v?.destroy();
    const session = recorder.current.finish();
    if (session.events.length > MAX_EVENTS) session.events.splice(0, session.events.length - MAX_EVENTS);
    cbs.current.onFinish(session);
  }, []);

  const cancel = useCallback(() => {
    if (done.current) return;
    done.current = true;
    finalWaiter.current?.();
    voice.current?.destroy();
    cbs.current.onCancel();
  }, []);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
      else if (e.key === "Enter" && recording && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); void finish(); }
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, [recording, cancel, finish]);

  const resolve = useCallback((rect: LassoRect) => resolvePageTargets(rect), []);

  const onLasso = useCallback((ev: LassoEvent) => {
    (recorder.current?.add as unknown as Add | undefined)?.({ kind: "lasso", rect: ev.rect, targets: ev.targets });
    const now = Date.now();
    lastLasso.current = { t: now, targets: ev.targets, areas: ev.areas };
    // Speech just before the lasso ("make these bigger", then Shift+drag) still counts.
    const p = pendingSpeech.current;
    if (p && now - p.t <= LASSO_SPEECH_BEFORE_MS) {
      const hover = pointer.latest()?.hit ?? null;
      const req = buildIntentRequest(p.text, lastLasso.current, p.t, hover);
      pendingSpeech.current = null;
      if (req) {
        lastLasso.current = null;
        runCommand.current(p.text, req, ev.areas);
      }
    }
  }, [pointer]);

  const tail = transcript.length > 56 ? "…" + transcript.slice(-56) : transcript;
  const dur = reduce ? 0 : 0.2;

  return (
    <div data-narrate-ignore className="pointer-events-none fixed inset-0 z-[100]" role="dialog" aria-label="Narrate mode">
      <AnimatePresence>
        {!recording && (
          <motion.div
            key="countdown"
            className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-shell/95 text-ink backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur }}
          >
            <div className="relative flex h-12 w-12 items-center justify-center" aria-live="polite">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={count}
                  className="absolute text-[28px] font-normal leading-9"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.3 }}
                  transition={{ duration: dur }}
                >
                  {count}
                </motion.span>
              </AnimatePresence>
            </div>
            <ul className="mt-8 space-y-1 text-center text-[14px] text-ink-2">
              {HINTS.map((h) => <li key={h}>{h}</li>)}
            </ul>
            <button
              type="button"
              aria-label="Cancel narration"
              onClick={cancel}
              className={`mt-8 h-8 rounded-lg px-3 text-[14px] text-ink-2 transition-colors duration-150 hover:bg-hover ${focusRing}`}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {recording && (
        <>
          <NarrateBarView
            reduce={reduce}
            dur={dur}
            elapsed={fmt(elapsed)}
            mic={mic}
            micHint={micHint}
            text={finishing ? "Finishing…" : tail || "Listening…"}
            finishing={finishing}
            hint={POINTER_HINT}
            onFinish={() => void finish()}
            onCancel={cancel}
          />
          <Lasso resolve={resolve} onLasso={onLasso} />
          <PointerBubble pointer={pointer} phase={phase} reduce={reduce} />
        </>
      )}
    </div>
  );
}
