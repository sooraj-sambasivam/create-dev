import { fitDataUrl } from "./image";

/** Longest side of a captured pointer image, in pixels. */
export const CAPTURE_MAX_SIDE = 1024;
/** Contract limit for AskRequest.pointer.image (data URL length). */
export const CAPTURE_MAX_CHARS = 1_500_000;

/** Node types whose content is text or numbers; the JSON already carries them. */
const TEXT_TYPES = new Set(["text", "heading", "paragraph", "button", "link", "stat", "metric", "number", "badge", "tag", "list", "table", "input", "divider", "spacer", "icon", "code"]);
/** Node types that can show a picture. A container qualifies only when it has a background photo. */
const IMAGE_TYPES = new Set(["image", "avatar", "container", "map", "video"]);

/** Whether a node of this type (null when unknown) may carry a capturable picture. */
export function typeQualifies(type: string | null): boolean {
  if (!type) return true; // unknown: let the element's own image decide
  const t = type.toLowerCase();
  if (TEXT_TYPES.has(t)) return false;
  return IMAGE_TYPES.has(t);
}

/** The first url(...) in a CSS background-image value (gradient tints are skipped), or null. */
export function cssUrl(backgroundImage: string | null | undefined): string | null {
  if (!backgroundImage || backgroundImage === "none") return null;
  const m = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/i.exec(backgroundImage);
  const u = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
  return u || null;
}

export type CaptureKind = "data" | "same-origin" | "cross-origin";
export type CaptureSource = { url: string; kind: CaptureKind };

/** Classifies an image URL for fetching. Non-image data, blob and non-http(s) URLs return null. */
export function resolveSource(src: string | null | undefined, origin: string): CaptureSource | null {
  if (!src) return null;
  if (/^data:image\/(png|jpe?g|webp|gif);/i.test(src)) return { url: src, kind: "data" };
  if (/^(data|blob):/i.test(src)) return null;
  try {
    const u = new URL(src, origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return { url: u.href, kind: u.origin === origin ? "same-origin" : "cross-origin" };
  } catch {
    return null;
  }
}

export type CaptureInput = {
  /** The node's data-node-type, if any. */
  type: string | null;
  /** currentSrc || src of the first <img> in (or being) the node. */
  imgSrc?: string | null;
  /** Computed background-image of the node itself. */
  bgImage?: string | null;
  origin: string;
};

/** Which URL to capture for a node, or null when it has no picture worth sending. <img> beats a background. */
export function pickSource(i: CaptureInput): CaptureSource | null {
  if (!typeQualifies(i.type)) return null;
  return resolveSource(i.imgSrc, i.origin) ?? resolveSource(cssUrl(i.bgImage), i.origin);
}

async function blobToBitmapJpeg(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const k = Math.min(1, CAPTURE_MAX_SIDE / Math.max(bitmap.width, bitmap.height, 1));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bitmap.width * k));
    c.height = Math.max(1, Math.round(bitmap.height * k));
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}

/**
 * A JPEG (or small PNG/JPEG) data URL of the node's picture, at most 1024px and 1.5MB, or undefined.
 * Cross-origin pictures go through the same-origin /api/image/bytes proxy (their hosts may lack CORS);
 * a host the proxy refuses is skipped. Never throws.
 */
export async function captureNodeImage(el: HTMLElement | null, signal?: AbortSignal): Promise<string | undefined> {
  if (!el) return undefined;
  try {
    const type = el.getAttribute("data-node-type");
    if (!typeQualifies(type)) return undefined;
    const origin = window.location.origin;
    const canvas = el instanceof HTMLCanvasElement ? el : el.querySelector("canvas");
    if (canvas) {
      try {
        const out = await fitDataUrl(canvas.toDataURL("image/png"), { maxBytes: CAPTURE_MAX_CHARS, maxSide: CAPTURE_MAX_SIDE });
        if (/^data:image\/(png|jpeg);/i.test(out) && out.length <= CAPTURE_MAX_CHARS) return out;
      } catch {
        // tainted canvas: fall through to <img>
      }
    }
    const img = el instanceof HTMLImageElement ? el : el.querySelector("img");
    const src = pickSource({
      type,
      imgSrc: img ? img.currentSrc || img.src : null,
      bgImage: getComputedStyle(el).backgroundImage,
      origin,
    });
    if (!src) return undefined;
    const res =
      src.kind === "cross-origin"
        ? await fetch(`/api/image/bytes?url=${encodeURIComponent(src.url)}`, { credentials: "same-origin", signal })
        : await fetch(src.url, { credentials: "same-origin", signal });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return undefined;
    const jpeg = await blobToBitmapJpeg(blob);
    const out = await fitDataUrl(jpeg, { maxBytes: CAPTURE_MAX_CHARS, maxSide: CAPTURE_MAX_SIDE });
    return /^data:image\/jpeg;/i.test(out) && out.length <= CAPTURE_MAX_CHARS ? out : undefined;
  } catch {
    return undefined;
  }
}
