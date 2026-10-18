import { imageSize } from "../jev/image";
import type { CaptureInput } from "@create/shared";
import type { ImageCtx } from "./types";

const RE = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i;

export function readImage(input: CaptureInput): ImageCtx | null {
  if (!input.image) return null;
  const m = RE.exec(input.image);
  if (!m) return null;
  const bytes = Buffer.from(m[2]!.replace(/\s+/g, ""), "base64");
  const s = imageSize(bytes);
  const decoded = s ? { w: s.width, h: s.height } : null;
  const mime = m[1]!.toLowerCase() === "image/png" ? "image/png" : "image/jpeg";
  return { dataUrl: input.image, mime, bytes, decoded, coord: input.imageSize ?? decoded, small: readSmall(input.imageSmall) };
}

const SMALL_RE = /^data:(image\/(?:png|jpeg|jpg));base64,([A-Za-z0-9+/=\s]+)$/i;

function readSmall(url: string | undefined): ImageCtx["small"] {
  const m = url ? SMALL_RE.exec(url) : null;
  if (!m) return null;
  const bytes = Buffer.from(m[2]!.replace(/\s+/g, ""), "base64");
  const s = imageSize(bytes);
  if (!s) return null;
  return { bytes, mime: m[1]!.toLowerCase() === "image/png" ? "image/png" : "image/jpeg", decoded: { w: s.width, h: s.height } };
}
