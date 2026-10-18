import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor, TLShapeId } from "tldraw";
import { Check, Loader2, Mic, X } from "lucide-react";
import type { SketchRequest } from "@create/shared";
import { createRecorder, createVoice, type Recorder, type VoiceController, type VoiceState } from "../../../narrate";
import { useScreenStore } from "../../../store/screenStore";
import { exportPng, shapeText, summarizeShapes, type ShapeLike } from "../shapes";
import { alignUtterances, createSpeechTracker } from "./align";
import { clientToPage, createPathRecorder, placeBubble, rectFromPoints, rectsIntersect, SAMPLE_HZ, type Rect } from "./geometry";
import { attachPointerTracker } from "./pointerTracker";
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
    "0 0 0 1.5px color-mix(in srgb, var(--color-accent) 60%, transparent), 0 2px 8px rgb(0 0 0 / 0.08)",
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export type CanvasNarrateProps = {
  editor: Editor;
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
 * Narrate over the canvas. The overlay fills the tldraw area (same rect as the tldraw container) and never leaves
 * mode "canvas". It is pointer-events-none, so it listens on the window in the capture phase (see pointerTracker.ts)
 * and maps the pointer through the tldraw container's rect. Only the pills (`data-narrate-ui`) take pointer events.
 */
export function CanvasNarrate({ editor, onBuild, onError, onClose }: CanvasNarrateProps) {
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

  // Pointer tracking + Shift-drag lasso. Capture phase on the window; "inside" comes from the tldraw container rect.
  useEffect(() => {
    const container = editor.getContainer();
    const getBox = () => container.getBoundingClientRect();
    const toPage = (cx: number, cy: number) => clientToPage((p) => editor.screenToPage(p), cx, cy);

    const place = (lx: number, ly: number) => {
      const el = bubbleRef.current;
      if (!el) return;
      const b = getBox();
      const at = placeBubble({ x: lx, y: ly }, { w: el.offsetWidth, h: el.offsetHeight }, { w: b.width, h: b.height });
      el.style.transform = `translate(${at.x}px, ${at.y}px)`;
      el.style.visibility = "";
    };

    const finishLasso = (box: Rect, startPage: { x: number; y: number }, endPage: { x: number; y: number }) => {
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

    return attachPointerTracker({
      target: window,
      getBox,
      isUi: (t) => t instanceof Element && !!t.closest("[data-narrate-ui]"),
      lassoEnabled: () => phaseRef.current === "recording",
      onMove: (i) => {
        pointer.current = { x: i.clientX, y: i.clientY, inside: true };
        place(i.local.x, i.local.y);
      },
      onLeave: () => {
        pointer.current.inside = false;
        if (bubbleRef.current) bubbleRef.current.style.visibility = "hidden";
      },
      onLassoStart: (s) => setLassoBox({ x: s.local.x, y: s.local.y, w: 0, h: 0 }),
      onLassoMove: (s, n) => setLassoBox(rectFromPoints(s.local, n.local)),
      onLassoEnd: (s, e, cancelled) => {
        setLassoBox(null);
        if (cancelled) return;
        finishLasso({ x: 0, y: 0, w: Math.abs(e.clientX - s.clientX), h: Math.abs(e.clientY - s.clientY) }, toPage(s.clientX, s.clientY), toPage(e.clientX, e.clientY));
      },
    });
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
  const kbd = "inline-flex h-6 items-center rounded-md border border-line bg-tray px-1.5 align-middle font-sans text-[12px] leading-none text-ink";
  const ghostBtn =
    "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const btn =
    "inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div ref={rootRef} data-canvas-narrate className="pointer-events-none absolute inset-0 z-[400] overflow-hidden text-ink">
      {glow.map((r, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute rounded-md bg-accent/10 transition-[left,top,width,height] duration-150"
          style={{ left: r.x - 4, top: r.y - 4, width: r.w + 8, height: r.h + 8, ...GLOW_STYLE }}
        />
      ))}
      {lassoBox && (
        <div
          aria-hidden
          className="absolute rounded-md border border-dashed border-accent bg-accent/10"
          style={{ left: lassoBox.x, top: lassoBox.y, width: lassoBox.w, height: lassoBox.h }}
        />
      )}

      {phase === "countdown" && (
        <div className="absolute inset-0 flex items-center justify-center bg-shell/70 backdrop-blur-sm">
          <div
            role="status"
            aria-live="polite"
            data-narrate-ui
            className="pointer-events-auto w-[340px] max-w-[90%] rounded-xl border border-line bg-surface p-5 text-center shadow-soft"
          >
            <div className="text-[28px] font-semibold tabular-nums leading-none text-ink">{count}</div>
            <p className="mt-3 text-sm font-medium text-ink">Talk while you point</p>
            <p className="mt-2 text-sm text-ink-2">
              Hold <kbd className={kbd}>Shift</kbd> and drag to lasso shapes
            </p>
            <p className="mt-1 text-sm text-ink-2">
              Hold <kbd className={kbd}>Option</kbd> to talk, double-tap to lock
            </p>
            <button type="button" onClick={cancel} className={`${ghostBtn} mt-4`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase !== "countdown" && (
        // Centered under the Canvas toolbar (top 8 + 48 + 8). The side padding keeps clear of tldraw's style panel.
        <div className="absolute inset-x-0 top-[74px] flex justify-center px-[164px]">
          <div
            role="status"
            aria-live="polite"
            data-narrate-ui
            className="pointer-events-auto flex h-10 w-full max-w-[560px] items-center gap-2 rounded-full border border-line bg-surface p-1 text-sm shadow-soft"
          >
            {phase === "recording" ? (
              <>
                <span aria-hidden className="ml-3 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-bad motion-reduce:animate-none" />
                <span className="w-10 shrink-0 tabular-nums text-ink-2">{fmt(elapsed)}</span>
                <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-ink-2">
                  {micOff ? (
                    <span className="truncate text-ink-2">Mic unavailable. Pointing only.</span>
                  ) : bubbleVisible ? (
                    <span className="truncate text-ink-2">Speaking…</span>
                  ) : live ? (
                    <span className="truncate text-ink">{live}</span>
                  ) : (
                    <>
                      <Mic size={18} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden />
                      <span className="truncate text-ink-2">Listening…</span>
                    </>
                  )}
                </span>
              </>
            ) : (
              <>
                <Loader2 size={18} strokeWidth={1.75} className="ml-3 shrink-0 animate-spin text-ink-2 motion-reduce:animate-none" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink">
                  {phase === "building" ? "Building from your narration…" : "Finishing…"}
                </span>
              </>
            )}
            {/* Fixed slots so Done / Cancel never shift between recording and building. */}
            <span className="flex w-[84px] shrink-0 justify-end">
              {phase === "recording" && (
                <button type="button" onClick={done} className={`${btn} w-full justify-center bg-accent font-medium text-white dark:text-[#0d0d0d] hover:opacity-90`} aria-label="Done">
                  <Check size={18} strokeWidth={1.75} aria-hidden />
                  Done
                </button>
              )}
            </span>
            <span className="flex w-[92px] shrink-0 justify-end">
              <button type="button" onClick={cancel} className={`${btn} w-full justify-center text-ink-2 hover:bg-hover hover:text-ink`} aria-label="Cancel">
                <X size={18} strokeWidth={1.75} aria-hidden />
                Cancel
              </button>
            </span>
          </div>
        </div>
      )}

      <div
        ref={bubbleRef}
        aria-hidden
        className={`absolute left-0 top-0 max-w-[260px] rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink shadow-soft transition-opacity duration-200 ${
          bubbleVisible ? "opacity-100" : "opacity-0"
        }`}
        style={{ transform: "translate(-9999px, -9999px)", visibility: "hidden" }}
      >
        <span className="line-clamp-3 break-words">{live.length > 160 ? `…${live.slice(-160)}` : live}</span>
      </div>
    </div>
  );
}
