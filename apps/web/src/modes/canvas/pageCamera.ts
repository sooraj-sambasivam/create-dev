import type { Editor } from "tldraw";
import { SECTION_H, fitZoom, pageCameraOptions, pageHeightFor, topInsetUnits } from "./groups";

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
  const apply = () => {
    // Always leave at least one section of room below the viewport, so a tall pane never makes the page unscrollable.
    const vp = editor.getViewportScreenBounds();
    const z = fitZoom(vp.w);
    const inset = topInsetUnits(vp.w);
    const viewH = Number.isFinite(vp.h) && vp.h > 0 ? vp.h / z : 0;
    const h = Math.max(pageHeightFor(maxBottom(editor)), Math.ceil((viewH + SECTION_H) / SECTION_H) * SECTION_H);
    if (h === last && inset === lastInset) return;
    const first = last === 0;
    last = h;
    lastInset = inset;
    editor.setCameraOptions(pageCameraOptions(h, inset));
    if (first) editor.setCamera({ x: 0, y: inset, z: 1 }, { immediate: true });
  };
  apply();
  const off = editor.store.listen(apply, { scope: "document" });
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
  ro?.observe(editor.getContainer());
  return () => {
    off();
    ro?.disconnect();
  };
}
