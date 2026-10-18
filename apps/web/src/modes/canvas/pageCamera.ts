import type { Editor } from "tldraw";
import { SECTION_H, fitZoom, initialCameraY, pageCameraOptions, pageHeightFor, topInsetPx, topInsetUnits } from "./groups";

/** Lowest edge of any shape on the current page (0 when empty). */
export function maxBottom(editor: Editor): number {
  let m = 0;
  for (const id of editor.getCurrentPageShapeIds()) {
    const b = editor.getShapePageBounds(id);
    if (b) m = Math.max(m, b.y + b.h);
  }
  return m;
}

/** Makes the canvas a page: fixed 1200-unit width fitted to the pane, vertical scroll only, no zoom. Returns a disposer. */
export function installPageCamera(editor: Editor): () => void {
  let last = 0;
  let lastInset = -1;
  const host = editor.getContainer().closest<HTMLElement>("[data-canvas-host]");
  const toolbar = host?.querySelector<HTMLElement>("[data-canvas-toolbar]") ?? null;
  const measurePx = () => {
    if (!host || !toolbar) return topInsetPx(null);
    return topInsetPx(toolbar.getBoundingClientRect().bottom - host.getBoundingClientRect().top);
  };
  const apply = () => {
    // Always leave at least one section of room below the viewport, so a tall pane never makes the page unscrollable.
    const vp = editor.getViewportScreenBounds();
    const z = fitZoom(vp.w);
    const inset = topInsetUnits(vp.w, measurePx());
    const viewH = Number.isFinite(vp.h) && vp.h > 0 ? vp.h / z : 0;
    const h = Math.max(pageHeightFor(maxBottom(editor)), Math.ceil((viewH + SECTION_H) / SECTION_H) * SECTION_H);
    if (h === last && inset === lastInset) return;
    const first = last === 0;
    const prevInset = lastInset;
    last = h;
    lastInset = inset;
    editor.setCameraOptions(pageCameraOptions(h, inset));
    const cam = editor.getCamera();
    // First load, or the inset changed while the view sat at the top: land exactly on the clamped top position.
    if (first || (inset !== prevInset && cam.y >= prevInset - 1)) {
      editor.setCamera({ x: 0, y: initialCameraY(inset, h, viewH), z: cam.z }, { immediate: true });
    }
  };
  apply();
  const off = editor.store.listen(apply, { scope: "document" });
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
  ro?.observe(editor.getContainer());
  if (toolbar) ro?.observe(toolbar);
  const offZoom = installZoomLock(editor);
  return () => {
    off();
    offZoom();
    ro?.disconnect();
  };
}

/** True for a wheel/pinch gesture that would zoom (ctrl or meta held; trackpad pinch arrives as ctrl+wheel). */
export function isZoomWheel(e: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.ctrlKey || e.metaKey;
}

/** True for a key that would zoom: cmd/ctrl with + - = 0, or tldraw's shift+0/1/2 reset, fit and zoom-to-selection. */
export function isZoomKey(e: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey?: boolean }): boolean {
  if (e.ctrlKey || e.metaKey) return ["+", "=", "-", "_", "0"].includes(e.key);
  return e.shiftKey && !e.altKey && ["Digit0", "Digit1", "Digit2"].includes(e.code ?? "");
}

function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true);
}

/** Blocks every way to zoom (ctrl+wheel, pinch, keyboard) before tldraw sees it; the page is fit-x only. Returns a disposer. */
export function installZoomLock(editor: Editor): () => void {
  const el = editor.getContainer();
  const wheel = (e: WheelEvent) => {
    if (!isZoomWheel(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const key = (e: KeyboardEvent) => {
    if (!isZoomKey(e) || (!(e.ctrlKey || e.metaKey) && isEditable(e.target))) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const gesture = (e: Event) => e.preventDefault();
  el.addEventListener("wheel", wheel, { capture: true, passive: false });
  el.addEventListener("keydown", key, true);
  for (const g of ["gesturestart", "gesturechange"]) el.addEventListener(g, gesture, true);
  return () => {
    el.removeEventListener("wheel", wheel, true);
    el.removeEventListener("keydown", key, true);
    for (const g of ["gesturestart", "gesturechange"]) el.removeEventListener(g, gesture, true);
  };
}
