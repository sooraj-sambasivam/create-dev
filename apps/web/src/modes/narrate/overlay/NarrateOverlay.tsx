import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { NarrationSession } from "@create/shared";
import { useScreenStore } from "../../../store/screenStore";
import { createRecorder } from "../../../narrate/session";
import { createVoice, DRAIN_TIMEOUT_MS } from "../../../narrate/voice";
import { Lasso, type LassoEvent } from "./Lasso";
import { MicPill, type MicState } from "./MicPill";
import { buildIntentRequest, resolvePageTargets, type LassoRect, type LassoTarget } from "./targets";

export type NarrateOverlayProps = {
  onFinish(session: NarrationSession): void;
  onCancel(): void;
};

export const HINTS = [
  "Feel free to speak",
  "Hold Shift and drag to lasso",
  "Hold Option to talk · double-tap Option to lock",
];

export const BROWSER_SPEECH_HINT = "Using browser speech recognition";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const MAX_EVENTS = 2000;

type Add = (e: Record<string, unknown>) => void;

export function NarrateOverlay({ onFinish, onCancel }: NarrateOverlayProps) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(3);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [mic, setMic] = useState<MicState>("idle");
  const [micHint, setMicHint] = useState<string | undefined>();
  const [finishing, setFinishing] = useState(false);

  const recorder = useRef<ReturnType<typeof createRecorder> | null>(null);
  const voice = useRef<ReturnType<typeof createVoice> | null>(null);
  const lastLasso = useRef<{ t: number; targets: LassoTarget[] } | null>(null);
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

  useEffect(() => {
    const rec = createRecorder("page");
    recorder.current = rec;
    const add = rec.add as unknown as Add;
    const v = createVoice({
      onTranscript: (text, final) => {
        setTranscript(text);
        if (final) {
          add({ kind: "speech", text, final });
          finalWaiter.current?.();
        }
        if (!final || done.current) return;
        const req = buildIntentRequest(text, lastLasso.current, Date.now());
        if (!req) return;
        lastLasso.current = null;
        void (async () => {
          try {
            const res = await fetch("/api/route-intent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(req),
            });
            if (!res.ok) return;
            if (done.current) return;
            const intent = (await res.json()) as { isCommand?: boolean; targetId?: string | null; action?: string };
            if (intent.isCommand && intent.targetId) {
              add({ kind: "note", text: `Live command (${intent.action ?? "edit"}) on ${intent.targetId}: ${text}`.slice(0, 4000) });
              void useScreenStore.getState().editNodeWithAI(intent.targetId, text);
            }
          } catch {
            /* a failed intent check just means the line is recorded as narration */
          }
        })();
      },
      onEngine: () => setMicHint(BROWSER_SPEECH_HINT),
      onState: (s) => { micRef.current = s as MicState; setMic(s as MicState); },
    });
    voice.current = v;
    if (!v.available) setMic("unavailable");
    const unbind = v.bindKeys();
    return () => {
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
    lastLasso.current = { t: Date.now(), targets: ev.targets };
  }, []);

  const tail = transcript.length > 56 ? "…" + transcript.slice(-56) : transcript;
  const dur = reduce ? 0 : 0.2;

  return (
    <div data-narrate-ignore className="fixed inset-0 z-[100]" role="dialog" aria-label="Narrate mode">
      <AnimatePresence>
        {!recording && (
          <motion.div
            key="countdown"
            className="absolute inset-0 flex flex-col items-center justify-center bg-shell/95 text-ink backdrop-blur-sm"
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
          <motion.div
            className="pointer-events-auto absolute flex max-w-[min(640px,calc(100vw-32px))] -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface p-1 pl-4 text-ink shadow-soft"
            style={{ left: "50%", top: 52 }}
            aria-busy={finishing}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur }}
          >
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full bg-bad ${reduce ? "" : "animate-pulse"}`} />
            <span className="text-[14px] tabular-nums" aria-label="Elapsed time">{fmt(elapsed)}</span>
            <MicPill state={mic} hint={micHint} />
            <span className="min-w-0 max-w-[260px] truncate text-[14px] text-ink-2" aria-live="polite">
              {finishing ? "Finishing…" : tail || "Listening…"}
            </span>
            <button
              type="button"
              aria-label="Finish narration"
              onClick={() => void finish()}
              disabled={finishing}
              className={`h-8 rounded-full bg-accent px-3 text-[14px] text-white transition-opacity duration-150 dark:text-shell disabled:opacity-50 ${focusRing}`}
            >
              Done
            </button>
            <button
              type="button"
              aria-label="Cancel narration"
              onClick={cancel}
              disabled={finishing}
              className={`h-8 rounded-full px-3 text-[14px] text-ink-2 transition-colors duration-150 hover:bg-hover disabled:opacity-50 ${focusRing}`}
            >
              Cancel
            </button>
          </motion.div>
          <Lasso resolve={resolve} onLasso={onLasso} />
        </>
      )}
    </div>
  );
}
