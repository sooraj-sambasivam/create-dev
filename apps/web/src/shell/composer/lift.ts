/** Lift from screen: grab one frame of the user's screen, let them box a region, read it as data. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Smallest box worth reading, in displayed pixels. A click or a twitch is not a selection. */
export const MIN_BOX = 16;
/** Longest side of the crop sent to /api/extract (the route accepts 4M characters). */
export const LIFT_MAX_SIDE = 1600;

/** A drag from `a` to `b` as a positive-size rect clamped to the frame (width x height). */
export function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }, width: number, height: number): Rect {
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const x1 = clamp(Math.min(a.x, b.x), width);
  const y1 = clamp(Math.min(a.y, b.y), height);
  const x2 = clamp(Math.max(a.x, b.x), width);
  const y2 = clamp(Math.max(a.y, b.y), height);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function isUsableBox(r: Rect): boolean {
  return r.w >= MIN_BOX && r.h >= MIN_BOX;
}

/** Maps a rect in displayed pixels to the frame's natural pixels. */
export function toSource(r: Rect, shown: { w: number; h: number }, natural: { w: number; h: number }): Rect {
  const kx = natural.w / Math.max(shown.w, 1);
  const ky = natural.h / Math.max(shown.h, 1);
  return { x: Math.round(r.x * kx), y: Math.round(r.y * ky), w: Math.max(1, Math.round(r.w * kx)), h: Math.max(1, Math.round(r.h * ky)) };
}

/** Output size for a crop: unchanged when it fits, else scaled so the long side is `max`. */
export function fitSize(w: number, h: number, max = LIFT_MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

export function canLift(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

export interface Frame {
  canvas: HTMLCanvasElement;
  url: string;
}

/** Asks which screen or window to share, grabs one frame, and stops every track right away. */
export async function grabFrame(): Promise<Frame> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    if (!video.videoWidth) await new Promise<void>((ok) => video.addEventListener("loadedmetadata", () => ok(), { once: true }));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't read the screen.");
    ctx.drawImage(video, 0, 0);
    video.pause();
    video.srcObject = null;
    return { canvas, url: canvas.toDataURL("image/png") };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** The boxed region as a JPEG data URL, scaled to LIFT_MAX_SIDE. */
export function cropToDataUrl(canvas: HTMLCanvasElement, src: Rect): string {
  const out = fitSize(src.w, src.h);
  const c = document.createElement("canvas");
  c.width = out.w;
  c.height = out.h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Couldn't crop the screen.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.w, out.h);
  ctx.drawImage(canvas, src.x, src.y, src.w, src.h, 0, 0, out.w, out.h);
  return c.toDataURL("image/jpeg", 0.88);
}
