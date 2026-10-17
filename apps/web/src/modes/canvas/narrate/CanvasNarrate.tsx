import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor, TLShapeId } from "tldraw";
import { Check, Loader2, Mic, X } from "lucide-react";
import type { SketchRequest } from "@create/shared";
import { createRecorder, createVoice, type Recorder, type VoiceController, type VoiceState } from "../../../narrate";
import { useScreenStore } from "../../../store/screenStore";
import { exportPng, shapeText, summarizeShapes, type ShapeLike } from "../shapes";
import { alignUtterances, createSpeechTracker } from "./align";
import { clientToPage, createPathRecorder, rectFromPoints, rectsIntersect, SAMPLE_HZ, type Pt, type Rect } from "./geometry";
import { buildPrompt, type TargetInfo } from "./prompt";

type Phase = "countdown" | "recording" | "finishing" | "building";

const COUNT_FROM = 3;
const COUNT_MS = 800;
const LASSO_MIN_PX = 4;
const LASSO_GLOW_MS = 3000;
const BUBBLE_QUIET_MS = 1800;
/** 1x1 transparent PNG, for a narration with nothing drawn on the page yet. */
const BLANK_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const GLOW_STYLE: React.CSSProperties = {
  boxShadow:
    "0 0 0 2px color-mix(in srgb, var(--color-accent) 60%, transparent), 0 0 18px color-mix(in srgb, var(--color-accent) 40%, transparent)",
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export type CanvasNarrateProps = {
  editor: Editor;
  /** CSS `right` offset so the centered UI avoids the preview pane, e.g. "40%" or "0px". */
  insetRight?: string;
  /** Sends the request and reveals the result in the preview pane. Resolves when the reveal is done. */
  onBuild: (req: SketchRequest, signal: AbortSignal) => Promise<void>;
  onError: (message: string) => void;
  onClose: () => void;
};

function shapeInfo(editor: Editor, id: string): TargetInfo | undefined {
  const shape = editor.getShape(id as TLShapeId);
  if (!shape) return undefined;
  const geo = (shape as unknown as { props?: { geo?: unknown } }).props?.geo;
  return { id, type: shape.type, geo: typeof geo === "string" ? geo : undefined, text: shapeText(shape as unknown as ShapeLike) };
}

/**
 * Narrate over the canvas. Mounted inside the tldraw container (its parent element); never leaves mode "canvas".
 * Only the pill buttons take pointer events, everything else passes through to tldraw.
 */
export function CanvasNarrate({ editor, insetRight = "0px", onBuild, onError, onClose }: CanvasNarrateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [phase, setPhaseState] = useState<Phase>("countdown");
  const phaseRef = useRef<Phase>("countdown");
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [count, setCount] = useState(COUNT_FROM);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [glow, setGlow] = useState<Rect[]>([]);
  const [lassoBox, setLassoBox] = useState<Rect | null>(null);

  const t0 = useRef(0);
  const recorder = useRef<Recorder | null>(null);
  const voice = useRef<VoiceController | null>(null);
  const unbind = useRef<(() => void) | null>(null);
  const tracker = useRef(createSpeechTracker());
  const path = useRef(createPathRecorder(SAMPLE_HZ));
  const lassos = useRef<{ t: number; ids: string[] }[]>([]);
  const lassoIds = useRef<{ ids: string[]; until: number }>({ ids: [], until: 0 });
  const pointer = useRef<{ x: number; y: number; inside: boolean }>({ x: 0, y: 0, inside: false });
  const abort = useRef<AbortController>(new AbortController());
  const closed = useRef(false);
  const speakingRef = useRef(false);
  const glowKey = useRef("");

  const now = () => Date.now() - t0.current;

  const teardown = useCallback(() => {
    unbind.current?.();
    unbind.current = null;
    voice.current?.destroy();
    voice.current = null;
  }, []);
  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    teardown();
    onClose();
  }, [onClose, teardown]);
  const cancel = useCallback(() => {
    abort.current.abort();
    close();
  }, [close]);

  // Countdown, then start recording.
  useEffect(() => {
    closed.current = false;
    abort.current = new AbortController();
    // Create the voice during the countdown so the mic permission prompt appears early.
    const v = createVoice({
      onTranscript: (text, final) => {
        if (phaseRef.current !== "recording" && phaseRef.current !== "finishing") return;
        const t = now();
        tracker.current.onTranscript(text, final, t);
        recorder.current?.add({ kind: "speech", text, final });
        setLive(text);
      },
      onState: setVoiceState,
      onError: (m) => onError(m),
    });
    voice.current = v;
    unbind.current = v.bindKeys(window);

    let n = COUNT_FROM;
    const timer = setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCount(n);
        return;
      }
      clearInterval(timer);
      t0.current = Date.now();
      recorder.current = createRecorder("canvas");
      setPhase("recording");
      v.lock();
    }, COUNT_MS);
    return () => {
      clearInterval(timer);
      abort.current.abort();
      closed.current = true;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc cancels at any phase.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cancel]);

  // Pointer tracking + Shift-drag lasso. Capture phase on the tldraw container; events only stop when lassoing.
  useEffect(() => {
    const container = rootRef.current?.parentElement;
    if (!container) return;
    const local = (cx: number, cy: number): Pt => {
      const r = container.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    };
    const toPage = (cx: number, cy: number) => clientToPage((p) => editor.screenToPage(p), cx, cy);

    const place = (cx: number, cy: number) => {
      const el = bubbleRef.current;
      if (!el) return;
      const r = container.getBoundingClientRect();
      const x = Math.min(Math.max(cx - r.left + 16, 8), Math.max(8, r.width - el.offsetWidth - 8));
      const y = Math.min(Math.max(cy - r.top + 20, 8), Math.max(8, r.height - el.offsetHeight - 8));
      el.style.transform = `translate(${x}px, ${y}px)`;
    };

    let lasso: { start: Pt; startClient: Pt } | null = null;

    const finishLasso = (box: Rect, startPage: Pt, endPage: Pt) => {
      let ids: string[];
      if (box.w < LASSO_MIN_PX && box.h < LASSO_MIN_PX) {
        const hit = editor.getShapeAtPoint(endPage, { hitInside: true, margin: 4 });
        ids = hit ? [hit.id] : [];
      } else {
        const pageRect = rectFromPoints(startPage, endPage);
        const pageId = editor.getCurrentPageId();
        ids = editor
          .getCurrentPageShapes()
          .filter((s) => s.parentId === pageId)
          .filter((s) => {
            const b = editor.getShapePageBounds(s.id);
            return !!b && rectsIntersect(pageRect, { x: b.x, y: b.y, w: b.w, h: b.h });
          })
          .map((s) => s.id as string);
      }
      if (!ids.length) return;
      const t = now();
      lassos.current.push({ t, ids });
      lassoIds.current = { ids, until: Date.now() + LASSO_GLOW_MS };
      recorder.current?.add({
        kind: "lasso",
        rect: rectFromPoints(startPage, endPage),
        targets: ids.slice(0, 100).map((id) => ({ id, label: shapeInfo(editor, id)?.text ?? shapeInfo(editor, id)?.type ?? "shape", kind: "shape" as const })),
      });
    };

    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY, inside: true };
      place(e.clientX, e.clientY);
      if (lasso) {
        e.preventDefault();
        e.stopPropagation();
        setLassoBox(rectFromPoints(local(lasso.startClient.x, lasso.startClient.y), local(e.clientX, e.clientY)));
      }
    };
    const onLeave = () => {
      pointer.current.inside = false;
    };
    const onDown = (e: PointerEvent) => {
      if (phaseRef.current !== "recording" || !e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      lasso = { start: toPage(e.clientX, e.clientY), startClient: { x: e.clientX, y: e.clientY } };
      setLassoBox({ ...local(e.clientX, e.clientY), w: 0, h: 0 });
    };
    const onUp = (e: PointerEvent) => {
      if (!lasso) return;
      e.preventDefault();
      e.stopPropagation();
      const px = Math.abs(e.clientX - lasso.startClient.x);
      const py = Math.abs(e.clientY - lasso.startClient.y);
      finishLasso({ x: 0, y: 0, w: px, h: py }, lasso.start, toPage(e.clientX, e.clientY));
      lasso = null;
      setLassoBox(null);
    };

    container.addEventListener("pointermove", onMove, true);
    container.addEventListener("pointerleave", onLeave);
    container.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      container.removeEventListener("pointermove", onMove, true);
      container.removeEventListener("pointerleave", onLeave);
      container.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, [editor]);

  // ~30Hz sampler: path in PAGE coordinates, shape under the pointer, highlights, timer.
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => {
      const t = now();
      const wall = Date.now();
      const active = tracker.current.isActive(t, BUBBLE_QUIET_MS);
      if (active !== speakingRef.current) {
        speakingRef.current = active;
        setSpeaking(active);
      }
      let hoverId: string | null = null;
      const p = pointer.current;
      if (p.inside) {
        const page = clientToPage((q) => editor.screenToPage(q), p.x, p.y);
        const hit = editor.getShapeAtPoint(page, { hitInside: true, margin: 4 });
        hoverId = hit ? (hit.id as string) : null;
        path.current.add(t, page, hoverId);
      }
      const ids = new Set<string>();
      if (active && hoverId) ids.add(hoverId);
      if (wall < lassoIds.current.until) lassoIds.current.ids.forEach((id) => ids.add(id));
      const rects: Rect[] = [];
      for (const id of ids) {
        const b = editor.getShapePageBounds(id as TLShapeId);
        if (!b) continue;
        const a = editor.pageToViewport({ x: b.x, y: b.y });
        const c = editor.pageToViewport({ x: b.x + b.w, y: b.y + b.h });
        rects.push({ x: Math.round(a.x), y: Math.round(a.y), w: Math.round(c.x - a.x), h: Math.round(c.y - a.y) });
      }
      const key = JSON.stringify(rects);
      if (key !== glowKey.current) {
        glowKey.current = key;
        setGlow(rects);
      }
    }, Math.round(1000 / SAMPLE_HZ));
    const clock = setInterval(() => setElapsed(now()), 250);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, editor]);

  const done = useCallback(async () => {
    if (phaseRef.current !== "recording") return;
    setPhase("finishing");
    voice.current?.stop();
    // Let the last segment deliver its final transcript.
    const deadline = Date.now() + 1800;
    await sleep(250);
    while (tracker.current.hasPending() && Date.now() < deadline) await sleep(100);
    if (closed.current) return;
    const endT = now();
    tracker.current.flush(endT);
    const spans = tracker.current.spans.filter((s) => s.text.trim());
    if (!spans.length) {
      onError("I didn't catch any words. Talk while you point, then press Done.");
      setPhase("recording");
      voice.current?.lock();
      return;
    }
    setPhase("building");
    teardown();
    try {
      const utterances = alignUtterances(spans, path.current.points, lassos.current, endT);
      const prompt = buildPrompt(utterances, (id) => shapeInfo(editor, id));
      const referenced = [...new Set(utterances.flatMap((u) => u.targetIds))].filter((id) => editor.getShape(id as TLShapeId));
      const ids = referenced.length ? referenced : undefined;
      const image = (await exportPng(editor, ids)) || BLANK_PNG;
      recorder.current?.add({ kind: "note", text: prompt.slice(0, 4000) });
      recorder.current?.finish();
      await onBuild(
        { image, shapes: summarizeShapes(editor, ids), prompt, screen: useScreenStore.getState().screen },
        abort.current.signal,
      );
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") onError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      close();
    }
  }, [editor, onBuild, onError, close, teardown]);

  const bubbleVisible = phase === "recording" && speaking && !!live;
  const micOff = voiceState === "unavailable";
  const btn =
    "inline-flex h-8 items-center gap-2 rounded-lg px-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div ref={rootRef} data-canvas-narrate className="pointer-events-none absolute inset-0 z-[400] overflow-hidden text-ink">
      {glow.map((r, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute rounded-md bg-accent/10 transition-[left,top,width,height] duration-100"
          style={{ left: r.x - 3, top: r.y - 3, width: r.w + 6, height: r.h + 6, ...GLOW_STYLE }}
        />
      ))}
      {lassoBox && (
        <div
          aria-hidden
          className="absolute rounded-sm border border-dashed border-accent bg-accent/10"
          style={{ left: lassoBox.x, top: lassoBox.y, width: lassoBox.w, height: lassoBox.h }}
        />
      )}

      {phase === "countdown" && (
        <div className="absolute inset-y-0 left-0 flex items-center justify-center" style={{ right: insetRight }}>
          <div
            role="status"
            aria-live="polite"
            className="w-[300px] max-w-[90%] rounded-2xl border border-line bg-surface p-5 text-center shadow-soft"
          >
            <div className="text-5xl font-semibold tabular-nums leading-none text-ink">{count}</div>
            <p className="mt-3 text-sm font-medium text-ink">Talk while you point</p>
            <p className="mt-2 text-xs text-ink-2">
              Hold <kbd className="rounded border border-line bg-tray px-1 font-sans">Shift</kbd> and drag to lasso shapes
            </p>
            <p className="mt-1 text-xs text-ink-2">
              Hold <kbd className="rounded border border-line bg-tray px-1 font-sans">Option</kbd> to talk · double-tap to lock
            </p>
            <button type="button" onClick={cancel} className={`${btn} pointer-events-auto mt-3 text-ink-2 hover:bg-hover hover:text-ink`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase !== "countdown" && (
        <div className="absolute left-0 flex justify-center px-3" style={{ top: 68, right: insetRight }}>
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex h-11 w-[min(640px,100%)] items-center gap-3 rounded-xl border border-line bg-surface px-3 text-sm shadow-soft"
          >
            {phase === "recording" ? (
              <>
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-bad motion-reduce:animate-none" />
                <span className="w-10 shrink-0 tabular-nums text-ink-2">{fmt(elapsed)}</span>
                <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-ink-2">
                  {micOff ? (
                    <span className="truncate text-ink-3">Mic unavailable. Pointing only.</span>
                  ) : live ? (
                    <span className="truncate text-ink">{live}</span>
                  ) : (
                    <>
                      <Mic size={18} strokeWidth={1.75} className="shrink-0 text-ink-3" aria-hidden />
                      <span className="truncate text-ink-3">Listening…</span>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={done}
                  className={`${btn} bg-accent px-3 font-medium text-white hover:opacity-90`}
                  aria-label="Done"
                >
                  <Check size={18} strokeWidth={1.75} aria-hidden />
                  Done
                </button>
                <button type="button" onClick={cancel} className={`${btn} text-ink-2 hover:bg-hover hover:text-ink`} aria-label="Cancel">
                  <X size={18} strokeWidth={1.75} aria-hidden />
                  Cancel
                </button>
              </>
            ) : (
              <>
                <Loader2 size={18} strokeWidth={1.75} className="shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink">
                  {phase === "building" ? "Building from your narration…" : "Finishing…"}
                </span>
                <button type="button" onClick={cancel} className={`${btn} text-ink-2 hover:bg-hover hover:text-ink`} aria-label="Cancel">
                  <X size={18} strokeWidth={1.75} aria-hidden />
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div
        ref={bubbleRef}
        aria-hidden
        className={`absolute left-0 top-0 max-w-[260px] rounded-xl rounded-tl-sm border border-line bg-surface px-3 py-1.5 text-xs text-ink shadow-soft transition-opacity duration-300 ${
          bubbleVisible ? "opacity-100" : "opacity-0"
        }`}
        style={{ transform: "translate(-9999px, -9999px)" }}
      >
        <span className="line-clamp-3 break-words">{live.length > 160 ? `…${live.slice(-160)}` : live}</span>
      </div>
    </div>
  );
}
