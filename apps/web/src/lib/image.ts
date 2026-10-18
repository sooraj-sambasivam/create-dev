export interface FitOptions {
  /** Max length of the returned data URL, in bytes (it is ASCII, so bytes = chars). */
  maxBytes?: number;
  /** Max width or height in pixels. */
  maxSide?: number;
}

export const DEFAULT_MAX_BYTES = 3_500_000;
export const DEFAULT_MAX_SIDE = 2048;

/** Encoder quality steps tried at each size, best first. */
export const QUALITY_STEPS = [0.92, 0.82, 0.7, 0.55] as const;
/** Each size step multiplies the previous side by this. */
export const SIDE_FACTOR = 0.75;
const MIN_SIDE = 256;

export interface Attempt {
  width: number;
  height: number;
  quality: number;
}

/** Size of a data URL as sent over the wire. */
export function dataUrlBytes(dataUrl: string): number {
  return dataUrl.length;
}

/** Dimensions scaled down (never up) so the longest side is at most maxSide. */
export function fitSide(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest <= 0) return { width, height };
  const k = maxSide / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * Ordered encode attempts: full (capped) size at every quality step, then each
 * smaller size at every quality step, until the side would drop below the floor.
 */
export function planAttempts(width: number, height: number, maxSide: number): Attempt[] {
  const out: Attempt[] = [];
  let size = fitSide(width, height, maxSide);
  for (;;) {
    for (const quality of QUALITY_STEPS) out.push({ ...size, quality });
    const next = { width: Math.round(size.width * SIDE_FACTOR), height: Math.round(size.height * SIDE_FACTOR) };
    if (Math.max(next.width, next.height) < MIN_SIDE) break;
    size = { width: Math.max(1, next.width), height: Math.max(1, next.height) };
  }
  return out;
}

async function loadBitmap(dataUrl: string): Promise<ImageBitmap> {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error("read failed"));
    fr.readAsDataURL(blob);
  });
}

async function encode(bitmap: ImageBitmap, a: Attempt): Promise<string> {
  const mime = "image/jpeg";
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(a.width, a.height);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.fillStyle = "#fff"; // JPEG has no alpha
    ctx.fillRect(0, 0, a.width, a.height);
    ctx.drawImage(bitmap, 0, 0, a.width, a.height);
    return blobToDataUrl(await c.convertToBlob({ type: mime, quality: a.quality }));
  }
  const c = document.createElement("canvas");
  c.width = a.width;
  c.height = a.height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, a.width, a.height);
  ctx.drawImage(bitmap, 0, 0, a.width, a.height);
  return c.toDataURL(mime, a.quality);
}

/**
 * Returns a data URL no larger than maxBytes, re-encoding as JPEG at lower
 * quality and then smaller size as needed. A small PNG already within limits
 * is returned untouched. If nothing fits, or decoding is unavailable, returns
 * the smallest result produced (or the input) and lets the server decide.
 */
export async function fitDataUrl(dataUrl: string, opts: FitOptions = {}): Promise<string> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxSide = opts.maxSide ?? DEFAULT_MAX_SIDE;
  if (!dataUrl) return dataUrl;
  let bitmap: ImageBitmap;
  try {
    bitmap = await loadBitmap(dataUrl);
  } catch {
    return dataUrl;
  }
  try {
    const fits = dataUrlBytes(dataUrl) <= maxBytes && Math.max(bitmap.width, bitmap.height) <= maxSide;
    if (fits) return dataUrl;
    let best = dataUrl;
    for (const a of planAttempts(bitmap.width, bitmap.height, maxSide)) {
      const out = await encode(bitmap, a);
      if (dataUrlBytes(out) < dataUrlBytes(best)) best = out;
      if (dataUrlBytes(out) <= maxBytes) return out;
    }
    return best;
  } catch {
    return dataUrl;
  } finally {
    bitmap.close();
  }
}
