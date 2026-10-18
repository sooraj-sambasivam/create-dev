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

/* ---------- locate: refine the dragged box through POST /api/locate ---------- */

/** Longest side of the frame sent to /api/locate. Keeps the body well under the 12M-character cap. */
export const LOCATE_MAX_SIDE = 1280;
/** Locate must answer inside this budget or the dragged box is used. */
export const LOCATE_TIMEOUT_MS = 4000;
/** A located box is trusted only at or above this confidence. */
export const LOCATE_MIN_CONFIDENCE = 0.5;

export interface LocateCandidate {
  box: Rect;
  label: string;
  confidence: number;
}

export type LocateDecision =
  | { kind: "use"; box: Rect; label: string }
  | { kind: "ask"; ask: string; candidates: LocateCandidate[] }
  | { kind: "fallback"; reason: string };

export function iou(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = x * y;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Scales a rect between coordinate spaces (sent-image pixels <-> displayed pixels). */
export function scaleRect(r: Rect, from: { w: number; h: number }, to: { w: number; h: number }): Rect {
  const kx = to.w / Math.max(from.w, 1);
  const ky = to.h / Math.max(from.h, 1);
  return { x: r.x * kx, y: r.y * ky, w: r.w * kx, h: r.h * ky };
}

/** Request body for a "screen" locate: the user's box travels as cursor (its center) plus a hint. Never logged. */
export function buildScreenLocateRequest(image: string, imageSize: { w: number; h: number }, box: Rect) {
  return {
    input: {
      source: "screen" as const,
      image,
      imageSize,
      cursor: { x: Math.round(box.x + box.w / 2), y: Math.round(box.y + box.h / 2) },
      hint: `box:${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.w)},${Math.round(box.h)}`,
    },
  };
}

interface LocateResultLike {
  box: Rect;
  label: string;
  confidence: number;
  candidates?: { box: Rect; label: string; confidence: number }[];
}

/**
 * Turns a /api/locate answer into one next step. `userBox` and the result share the sent image's pixel space.
 * Never returns nothing: a miss is either an `ask` ("Which one?") or a `fallback` with a reason to show.
 */
export function decideLocate(res: { result: LocateResultLike | null; ask?: string } | null, userBox: Rect): LocateDecision {
  if (!res) return { kind: "fallback", reason: "No answer from locate" };
  const r = res.result;
  if (res.ask || !r) {
    const list = (r?.candidates ?? []).slice(0, 5).map((c) => ({ box: c.box, label: c.label, confidence: c.confidence }));
    return { kind: "ask", ask: res.ask || "Which one?", candidates: list };
  }
  if (r.confidence >= LOCATE_MIN_CONFIDENCE && iou(r.box, userBox) >= 0.25) return { kind: "use", box: r.box, label: r.label };
  if (r.confidence >= LOCATE_MIN_CONFIDENCE) {
    // Confident, but it is not where the user dragged: let them choose.
    return { kind: "ask", ask: "Which one?", candidates: [{ box: r.box, label: r.label, confidence: r.confidence }] };
  }
  return { kind: "fallback", reason: "Not sure what is in that box" };
}

/** The frozen frame as a JPEG capped at LOCATE_MAX_SIDE. Returns the data URL and its size. */
export async function frameForLocate(frameUrl: string): Promise<{ image: string; size: { w: number; h: number } }> {
  const img = new Image();
  img.src = frameUrl;
  await img.decode();
  const size = fitSize(img.naturalWidth, img.naturalHeight, LOCATE_MAX_SIDE);
  const c = document.createElement("canvas");
  c.width = size.w;
  c.height = size.h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare the screen for locating.");
  ctx.drawImage(img, 0, 0, size.w, size.h);
  return { image: c.toDataURL("image/jpeg", 0.8), size };
}

export interface ClientStage {
  stage: "capture" | "locate" | "read" | "intent" | "act";
  provider: string;
  ms: number;
  ok: boolean;
  error?: string;
}

/** Client-side stage timings, kept for tests and demos. Bounded. */
export const clientStages: ClientStage[] = [];

/** Records a client stage with performance.measure and posts it to /api/traces. A failed post is logged, never thrown. */
export async function reportClientStage(s: ClientStage, traceId?: string): Promise<void> {
  clientStages.push(s);
  if (clientStages.length > 100) clientStages.shift();
  try {
    performance.measure(`create:${s.stage}:${s.provider}`, { start: performance.now() - s.ms, duration: s.ms });
  } catch {
    /* performance.measure options unsupported */
  }
  console.info(`[pointer] ${s.stage} ${s.provider} ${Math.round(s.ms)}ms ${s.ok ? "ok" : "fail"}${s.error ? " " + s.error : ""}`);
  try {
    const res = await fetch("/api/traces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "screen", traceId, stages: [s] }),
    });
    if (!res.ok && res.status !== 404) console.warn(`[pointer] trace post failed (${res.status})`);
  } catch (err) {
    console.warn("[pointer] trace post failed", err);
  }
}

/** Calls POST /api/locate with a timeout. Throws a readable Error on any failure. */
export async function locate(body: ReturnType<typeof buildScreenLocateRequest>, signal?: AbortSignal): Promise<{ result: LocateResultLike | null; ask?: string; trace?: { id: string } }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LOCATE_TIMEOUT_MS);
  signal?.addEventListener("abort", () => ctl.abort(), { once: true });
  try {
    const res = await fetch("/api/locate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error || `Locate said ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (ctl.signal.aborted) throw new Error("Locate took too long");
    throw err instanceof Error ? err : new Error("Locate failed");
  } finally {
    clearTimeout(timer);
  }
}
