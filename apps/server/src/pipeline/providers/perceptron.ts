import type { LocateResult } from "@create/shared";
import { boxFromCorners } from "../geometry";
import type { LocateProvider } from "../types";
import { kindFromText, proximityConfidence, timedFetch } from "./shared";

export const PERCEPTRON_DETECT_URL = "https://api.perceptron.inc/v1/detect";
export const PERCEPTRON_CATEGORIES = ["table", "chart", "list", "button", "text block"];

type Det = { mention?: string; point_box?: { top_left?: { x: number; y: number }; bottom_right?: { x: number; y: number } } | null };

/** Perceptron /v1/detect. Boxes come back in pixels of the image we sent; rescale into the input's coordinate space. */
export const locatePerceptron: LocateProvider = async (ctx) => {
  const key = process.env.PERCEPTRON_API_KEY?.trim();
  if (!key) throw new Error("PERCEPTRON_API_KEY not set");
  if (!ctx.image) return [];
  const res = await timedFetch(ctx, PERCEPTRON_DETECT_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ media: { type: "image", image_url: ctx.image.dataUrl }, categories: PERCEPTRON_CATEGORIES, config: { output: "box" } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { detections?: Det[] };
  const { decoded, coord } = ctx.image;
  const sx = decoded && coord ? coord.w / decoded.w : 1;
  const sy = decoded && coord ? coord.h / decoded.h : 1;
  const out: LocateResult[] = [];
  for (const d of body.detections ?? []) {
    const tl = d.point_box?.top_left;
    const br = d.point_box?.bottom_right;
    if (!tl || !br) continue;
    const box = boxFromCorners(tl.x * sx, tl.y * sy, br.x * sx, br.y * sy);
    if (!box) continue;
    const mention = d.mention ?? "";
    out.push({ box, kind: kindFromText(mention), label: mention.slice(0, 120) || "detected region", source: "perceptron", confidence: proximityConfidence(box, ctx, 0.85) });
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
};
