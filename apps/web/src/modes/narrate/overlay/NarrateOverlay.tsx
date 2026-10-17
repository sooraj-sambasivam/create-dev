import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { NarrationSession } from "@create/shared";
import { useScreenStore } from "../../../store/screenStore";
import { createRecorder } from "../../../narrate/session";
import { createVoice, DRAIN_TIMEOUT_MS } from "../../../narrate/voice";
import { Lasso, type LassoEvent } from "./Lasso";
import { MicPill, type MicState } from "./MicPill";
import { buildIntentRequest, resolveDomTargets, type LassoRect, type LassoTarget } from "./targets";

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
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent,#3E7BF0)]";

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

  const resolve = useCallback((rect: LassoRect) => resolveDomTargets(rect), []);

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
            className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm"
            style={{ background: "rgba(13,13,13,0.10)", color: "var(--ink, #0D0D0D)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur }}
          >
            <div className="relative flex h-28 w-28 items-center justify-center" aria-live="polite">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={count}
                  className="absolute text-[96px] font-light leading-none"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.3 }}
                  transition={{ duration: dur }}
                >
                  {count}
                </motion.span>
              </AnimatePresence>
            </div>
            <ul className="mt-6 space-y-1 text-center text-[14px]" style={{ color: "var(--ink-2, #5D5D5D)" }}>
              {HINTS.map((h) => <li key={h}>{h}</li>)}
            </ul>
            <button
              type="button"
              aria-label="Cancel narration"
              onClick={cancel}
              className={`mt-8 rounded-md px-3 py-1.5 text-[14px] hover:bg-[var(--hover,#EDEDED)] ${focusRing}`}
              style={{ color: "var(--ink-2, #5D5D5D)" }}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {recording && (
        <>
          <motion.div
            className="pointer-events-auto absolute left-1/2 top-4 flex max-w-[min(640px,calc(100vw-32px))] -translate-x-1/2 items-center gap-3 rounded-full py-2 pl-4 pr-2"
            style={{ background: "var(--surface, #fff)", border: "1px solid var(--line, #E6E6E6)", boxShadow: "0 4px 20px rgba(0,0,0,0.05)", color: "var(--ink, #0D0D0D)" }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur }}
          >
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${reduce ? "" : "animate-pulse"}`} style={{ background: "var(--bad, #C93C37)" }} />
            <span className="text-[14px] tabular-nums" aria-label="Elapsed time">{fmt(elapsed)}</span>
            <MicPill state={mic} hint={micHint} />
            <span className="min-w-0 max-w-[260px] truncate text-[14px]" style={{ color: "var(--ink-2, #5D5D5D)" }} aria-live="polite">
              {tail || "Listening…"}
            </span>
            <button
              type="button"
              aria-label="Finish narration"
              onClick={() => void finish()}
              className={`rounded-full px-3 py-1 text-[14px] text-white ${focusRing}`}
              style={{ background: "var(--accent, #3E7BF0)" }}
            >
              Done
            </button>
            <button
              type="button"
              aria-label="Cancel narration"
              onClick={cancel}
              className={`rounded-full px-3 py-1 text-[14px] hover:bg-[var(--hover,#EDEDED)] ${focusRing}`}
              style={{ color: "var(--ink-2, #5D5D5D)" }}
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
