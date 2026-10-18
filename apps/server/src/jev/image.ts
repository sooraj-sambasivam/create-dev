/**
 * Jev image step: asks TypeSafe System One (jev-1.14.0) whether a crop shows a data table or chart
 * and where. Calls the REST API directly (multipart) because the installed SDK has no image support.
 * Returns null for anything unusable (no key, bad size, timeout, HTTP or parse error); never throws.
 * Box confidence is uncalibrated, so presence is gated on the yes/no answer only.
 */

export const JEV_IMAGE_URL = "https://api.typesafe.ai/v1/systemone";
export const JEV_IMAGE_MODEL = "jev-1.14.0";
export const JEV_IMAGE_TIMEOUT_MS = 1500;
export const JEV_MIN_SIDE = 280;
export const JEV_MAX_SIDE = 1568;
export const JEV_PRESENT_THRESHOLD = 0.6;

export type JevBox = { top: number; bottom: number; left: number; right: number };
export type JevImageResult = { hasData: boolean; box: JevBox | null; ms: number };

const DATA_URL_RE = /^data:(image\/(?:png|jpeg|jpg));base64,([A-Za-z0-9+/=\s]+)$/;

/** Reads pixel size from PNG or JPEG bytes; null for other formats or truncated data. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString("ascii", 12, 16) === "IHDR") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1]!;
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

const frac = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);

export async function judgeImage(
  image: string,
  opts: { fetchImpl?: typeof fetch; apiKey?: string; timeoutMs?: number } = {},
): Promise<JevImageResult | null> {
  const apiKey = (opts.apiKey ?? process.env.TYPESAFE_API_KEY ?? "").trim();
  if (!apiKey) return null;
  const m = DATA_URL_RE.exec(image);
  if (!m) return null;
  const bytes = Buffer.from(m[2]!.replace(/\s+/g, ""), "base64");
  const size = imageSize(bytes);
  if (!size) return null;
  if (Math.min(size.width, size.height) < JEV_MIN_SIDE || Math.max(size.width, size.height) > JEV_MAX_SIDE) return null;

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? JEV_IMAGE_TIMEOUT_MS);
  try {
    const request = {
      model: JEV_IMAGE_MODEL,
      state: { shot: "a1" },
      assets: { a1: { type: "image", part: "img" } },
      questions: {
        present: { type: "noul", instructions: "Is there a data table or chart in `shot`?" },
        where: { type: "box", instructions: "Where is the table or chart in `shot`?" },
      },
    };
    const form = new FormData();
    form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }), "request");
    form.append("img", new Blob([new Uint8Array(bytes)], { type: m[1] === "image/png" ? "image/png" : "image/jpeg" }), "img");
    const res = await (opts.fetchImpl ?? fetch)(JEV_IMAGE_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "TypeSafe-Danger-Zone-Images": "true" },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[jev-image] HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { answers?: Record<string, any> };
    const p = body.answers?.present?.noul;
    if (typeof p !== "number" || !(p >= 0 && p <= 1)) return null;
    const hasData = p >= JEV_PRESENT_THRESHOLD;
    const b = body.answers?.where?.box;
    const top = frac(b?.top);
    const bottom = frac(b?.bottom);
    const left = frac(b?.left);
    const right = frac(b?.right);
    const valid = top !== null && bottom !== null && left !== null && right !== null && bottom > top && right > left;
    return { hasData, box: hasData && valid ? { top: top!, bottom: bottom!, left: left!, right: right! } : null, ms: Date.now() - started };
  } catch (err) {
    console.warn("[jev-image] skipped:", err instanceof Error ? err.name : "unknown");
    return null;
  } finally {
    clearTimeout(timer);
  }
}
