import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tldraw, type Editor, type TLComponents } from "tldraw";
import type { SketchRequest } from "@create/shared";
import "tldraw/tldraw.css";
import "./canvas.css";
import { Check, Info, PanelRight, X } from "lucide-react";
import { ScreenRenderer } from "../../components/ScreenRenderer";
import { useScreenStore } from "../../store/screenStore";
import { CanvasToolbar } from "./CanvasToolbar";
import { useCanvasStore } from "./canvasStore";
import { buildRevealFrames } from "./reveal";
import { generateSketch } from "./sketchApi";
import { exportPng, summarizeShapes } from "./shapes";
import { CanvasNarrate } from "./narrate";
import { classifyNarrateNotice } from "./notice";

/**
 * tldraw chrome we replace: the studio toolbar takes the top of the canvas, so the main/page menus and helper
 * buttons go (undo/redo and the rest stay on their shortcuts). The bottom tool bar, zoom widget and style panel stay.
 */
const TL_COMPONENTS: TLComponents = { MenuPanel: null, PageMenu: null, HelperButtons: null, Minimap: null };

const MIN_PCT = 20;
const MAX_PCT = 70;
const FRAME_MS = 110;
const ADD_PROMPT = "Add these elements to the current page";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const cssId = (id: string) => id.replace(/["\\]/g, "\\$&");

type Toast = { kind: "ok" | "info" | "error"; text: string } | null;

const PREVIEW_KEY = "create.canvas.previewOpen";
function readPreviewOpen(): boolean {
  try {
    return localStorage.getItem(PREVIEW_KEY) !== "0";
  } catch {
    return true;
  }
}
function countNodes(nodes: readonly { type: string; children?: unknown }[]): number {
  let n = 0;
  for (const node of nodes) {
    n++;
    if (node.type === "container" && Array.isArray(node.children)) n += countNodes(node.children);
  }
  return n;
}

/**
 * tldraw license: set VITE_TLDRAW_LICENSE_KEY (apps/web/.env) with the tldraw SDK key for
 * production; it is undefined in dev, which tldraw allows.
 */
function shellScheme(): "light" | "dark" {
  const el = document.documentElement;
  const t = el.getAttribute("data-theme");
  if (t === "dark" || t === "light") return t;
  if (el.classList.contains("dark")) return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyScheme(editor: Editor) {
  const colorScheme = shellScheme();
  if (editor.user.getUserPreferences().colorScheme !== colorScheme) editor.user.updateUserPreferences({ colorScheme });
}

/** Lays children out at a fixed design width and scales to the pane width: no horizontal scroll. */
const DESIGN_W = 1024;
function FitToWidth({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, h: 0 });
  const [scheme, setScheme] = useState(shellScheme);
  useEffect(() => {
    const sync = () => setScheme(shellScheme());
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", sync);
    return () => {
      mo.disconnect();
      mq?.removeEventListener?.("change", sync);
    };
  }, []);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => setBox({ scale: Math.min(1, o.clientWidth / DESIGN_W) || 1, h: i.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="p-4">
      <div ref={outer} className="overflow-hidden rounded-xl border border-line" style={{ height: box.h * box.scale, minHeight: 96 }}>
        <div ref={inner} className={`${scheme === "dark" ? "screen-dark" : "screen-light"} bg-[var(--bg)]`} style={{ width: DESIGN_W, transform: `scale(${box.scale})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Render when mode is "canvas", or mode is "narrate" and canvasStore.narrateFromCanvas (see canvasStore.ts). */
export function CanvasHost() {
  const mode = useScreenStore((s) => s.mode);
  const fromCanvas = useCanvasStore((s) => s.narrateFromCanvas);
  if (mode !== "canvas" && !(mode === "narrate" && fromCanvas)) return null;
  return <CanvasMode hidden={mode !== "canvas"} />;
}

export function CanvasMode({ hidden = false }: { hidden?: boolean } = {}) {
  const screen = useScreenStore((s) => s.screen);
  const setMode = useScreenStore((s) => s.setMode);
  const setEditor = useCanvasStore((s) => s.setEditor);
  const setNarrateFromCanvas = useCanvasStore((s) => s.setNarrateFromCanvas);

  const editorRef = useRef<Editor | null>(null);
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const restoreRef = useRef<(() => void) | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [open, setOpenState] = useState(readPreviewOpen);
  const setOpen = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    setOpenState((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      try {
        localStorage.setItem(PREVIEW_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);
  const [pct, setPct] = useState(40);
  const [toast, setToast] = useState<Toast>(null);
  const [newestId, setNewestId] = useState<string | null>(null);
  const count = countNodes(screen?.children ?? []);

  useEffect(
    () => () => {
      runRef.current++;
      abortRef.current?.abort();
      restoreRef.current?.();
      unlistenRef.current?.();
      unlistenRef.current = null;
      // Keep the editor alive while Narrate runs over the canvas.
      if (!useCanvasStore.getState().narrateFromCanvas) setEditor(null);
    },
    [setEditor],
  );

  // Keep tldraw's color scheme in sync with the shell theme (html[data-theme], else OS).
  useEffect(() => {
    const sync = () => editorRef.current && applyScheme(editorRef.current);
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", sync);
    return () => {
      mo.disconnect();
      mq?.removeEventListener?.("change", sync);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === "error" ? 8000 : 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      setEditor(editor);
      applyScheme(editor);
      setHasSelection(editor.getSelectedShapeIds().length > 0);
      unlistenRef.current?.();
      unlistenRef.current = editor.store.listen(() => setHasSelection(editor.getSelectedShapeIds().length > 0), { scope: "session" });
    },
    [setEditor],
  );

  /** Sends the sketch request, then reveals the result element by element in the preview pane. */
  const generateAndReveal = useCallback(async (req: Omit<SketchRequest, "screen">, signal: AbortSignal, myRun: number) => {
    const before = useScreenStore.getState().screen;
    const result = await generateSketch({ ...req, screen: before }, signal);
    if (runRef.current !== myRun) return;

    const frames = buildRevealFrames(result.screen);
    restoreRef.current = () => {
      useScreenStore.setState({ screen: before });
      restoreRef.current = null;
      setNewestId(null);
    };
    for (const frame of frames.slice(0, -1)) {
      // Intermediate frames bypass the undo stack.
      useScreenStore.setState({ screen: frame.screen });
      setNewestId(frame.newestId);
      await sleep(FRAME_MS);
      if (runRef.current !== myRun) return;
    }
    // Restore the pre-reveal page so the single undo entry points back to it.
    restoreRef.current = null;
    useScreenStore.setState({ screen: before });
    useScreenStore.getState().setScreen(result.screen, result.summary);
    setNewestId(null);
    setToast({ kind: "ok", text: result.summary });
  }, []);

  /** Narration from the canvas: open the preview, then generate and reveal like "Make it". */
  const buildNarration = useCallback(
    async (req: SketchRequest, signal: AbortSignal) => {
      restoreRef.current?.();
      const myRun = ++runRef.current;
      setToast(null);
      setOpen(true);
      setBusy(true);
      try {
        const { screen: _screen, ...rest } = req;
        void _screen;
        await generateAndReveal(rest, signal, myRun);
      } finally {
        if (runRef.current === myRun) {
          restoreRef.current?.();
          setBusy(false);
        }
      }
    },
    [generateAndReveal, setOpen],
  );

  const run = useCallback(
    async (selectionOnly: boolean) => {
      const editor = editorRef.current;
      if (!editor || busy) return;
      const ids = selectionOnly ? [...editor.getSelectedShapeIds()] : undefined;
      if (selectionOnly && !ids?.length) return;
      // A superseded run may have left a partial reveal in the store; undo it now.
      restoreRef.current?.();
      const myRun = ++runRef.current;
      setToast(null);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      try {
        const image = await exportPng(editor, ids);
        if (!image) {
          setToast({ kind: "error", text: "Draw something first." });
          return;
        }
        await generateAndReveal(
          { image, shapes: summarizeShapes(editor, ids), ...(selectionOnly ? { prompt: ADD_PROMPT } : {}) },
          ctrl.signal,
          myRun,
        );
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") {
          setToast({ kind: "error", text: e instanceof Error ? e.message : "Generation failed." });
        }
      } finally {
        if (runRef.current === myRun) {
          restoreRef.current?.();
          setBusy(false);
        }
      }
    },
    [busy, generateAndReveal],
  );

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const next = ((window.innerWidth - ev.clientX) / window.innerWidth) * 100;
      setPct(Math.min(MAX_PCT, Math.max(MIN_PCT, next)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const back = () => {
    setNarrateFromCanvas(false);
    setMode("text");
  };
  // Narrate stays inside the canvas app: no mode switch, no CanvasHost hand-off.
  const narrate = () => {
    if (busy || narrating || !editorRef.current) return;
    setToast(null);
    setNarrating(true);
  };
  const closeNarrate = useCallback(() => setNarrating(false), []);
  /** Narration notices: the server-to-browser speech fallback is informational, everything else is an error. */
  const narrateError = useCallback((text: string) => setToast({ kind: classifyNarrateNotice(text) === "info" ? "info" : "error", text }), []);

  return createPortal(
    <div
      data-canvas-host
      data-narrating={narrating || undefined}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      className={`fixed inset-0 z-40 bg-shell p-2 ${hidden ? "pointer-events-none invisible" : ""}`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-xl bg-surface">
      {/* The tldraw area: card width minus the preview pane (plus an 8px gap) so tldraw's own corners, watermark included, stay visible. */}
      <div className="absolute inset-y-0 left-0" style={{ right: open ? `calc(${pct}% + 8px)` : 0 }}>
        <Tldraw
          persistenceKey="create-dev-canvas"
          licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
          components={TL_COMPONENTS}
          onMount={handleMount}
        />
        {narrating && editorRef.current && (
          <CanvasNarrate editor={editorRef.current} onBuild={buildNarration} onError={narrateError} onClose={closeNarrate} />
        )}

        <div className="pointer-events-none absolute inset-x-0 top-2 z-[500] flex justify-center">
          <CanvasToolbar
            busy={busy}
            narrating={narrating}
            hasSelection={hasSelection}
            previewOpen={open}
            onBack={back}
            onNarrate={narrate}
            onMakeIt={() => run(false)}
            onAddSelection={() => run(true)}
            onTogglePreview={() => setOpen((v) => !v)}
          />
        </div>

        {toast && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-[500] flex justify-center px-3">
            <div
              role={toast.kind === "error" ? "alert" : "status"}
              className="canvas-rise-in pointer-events-auto flex w-max max-w-[min(480px,100%)] items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-soft"
            >
              {toast.kind === "ok" && <Check size={18} strokeWidth={1.75} className="mt-px shrink-0 text-ok" aria-hidden />}
              {toast.kind === "info" && <Info size={18} strokeWidth={1.75} className="mt-px shrink-0 text-ink-2" aria-hidden />}
              {toast.kind === "error" && <X size={18} strokeWidth={1.75} className="mt-px shrink-0 text-bad" aria-hidden />}
              <span className="min-w-0 break-words">{toast.text}</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setToast(null)}
                className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        )}
      </div>

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Show preview"
          className="canvas-fade-in absolute right-2 top-1/2 z-[500] inline-flex h-8 -translate-y-1/2 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-ink shadow-soft transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <PanelRight size={16} strokeWidth={1.75} aria-hidden />
          Preview · {count}
        </button>
      )}

      {open && (
        <aside
          aria-label="Preview"
          className="canvas-slide-in absolute inset-y-2 right-2 z-[500]"
          style={{ width: `calc(${pct}% - 8px)` }}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize preview"
            onPointerDown={startResize}
            className="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize"
          >
            <span className="absolute left-1/2 top-1/2 h-8 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line transition-colors duration-150 group-hover:bg-accent group-active:bg-accent" />
          </div>
          <div className="flex h-full overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{screen?.title || "Untitled page"}</div>
                <div className="text-xs text-ink-3">
                  {count} {count === 1 ? "element" : "elements"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close preview"
                title="Close preview"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </header>
            <div className="canvas-preview relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-tray">
              {screen && count > 0 ? (
                <>
                  {newestId && (
                    <style>{`@keyframes canvas-pop{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}.canvas-preview [data-node-id="${cssId(newestId)}"]{animation:canvas-pop .2s ease-out}@media (prefers-reduced-motion:reduce){.canvas-preview [data-node-id]{animation:none!important}}`}</style>
                  )}
                  <FitToWidth>
                    <ScreenRenderer screen={screen} editable={false} />
                  </FitToWidth>
                </>
              ) : (
                busy ? (
                  <div role="status" aria-live="polite" className="flex h-full flex-col gap-3 p-3">
                    <p className="text-sm text-ink-2">Building…</p>
                    {[96, 56, 72, 56].map((h, i) => (
                      <div key={i} className="shimmer rounded-xl bg-hover motion-reduce:animate-none" style={{ height: h }} />
                    ))}
                  </div>
                ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-hover">
                    <PanelRight size={24} strokeWidth={1.75} className="text-ink-3" aria-hidden />
                  </div>
                  <p className="text-base text-ink-2">Nothing here yet</p>
                  <p className="text-sm text-ink-3">Sketch something, then press Make it.</p>
                </div>
                )
              )}
            </div>
          </div>
          </div>
        </aside>
      )}
      </div>
    </div>,
    document.body,
  );
}
