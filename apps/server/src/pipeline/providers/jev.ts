import { JEV_IMAGE_MODEL, JEV_IMAGE_URL, JEV_MAX_SIDE, JEV_MIN_SIDE, JEV_PRESENT_THRESHOLD } from "../../jev/image";
import type { LocateProvider } from "../types";
import { cursorFraction, timedFetch } from "./shared";

const r2 = (n: number) => Math.round(n * 100) / 100;
const frac = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);

/** Jev 1.14: yes/no gate plus one box for the element under the cursor. Preview model, hence the lowest prior. */
export const locateJev: LocateProvider = async (ctx) => {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) throw new Error("TYPESAFE_API_KEY not set");
  const img = ctx.image;
  if (!img?.decoded || !img.coord) throw new Error("image size unreadable");
  const { w, h } = img.decoded;
  if (Math.min(w, h) < JEV_MIN_SIDE || Math.max(w, h) > JEV_MAX_SIDE) throw new Error(`image ${w}x${h} outside Jev limits`);
  if (img.mime !== "image/png" && img.mime !== "image/jpeg") throw new Error("Jev needs PNG or JPEG");
  const f = cursorFraction(ctx);
  const where = f ? `at x=${f.x.toFixed(3)}, y=${f.y.toFixed(3)} (fractions from the top-left)` : "";
  const request = {
    model: JEV_IMAGE_MODEL,
    state: { shot: "a1" },
    assets: { a1: { type: "image", part: "img" } },
    questions: {
      present: { type: "noul", instructions: `Is there a table or chart ${where ? `${where} ` : ""}in \`shot\`?` },
      where: { type: "box", instructions: `Where is the table or chart under the cursor ${where} in \`shot\`?`.replace("  ", " ") },
    },
  };
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }), "request");
  form.append("img", new Blob([new Uint8Array(img.bytes)], { type: img.mime }), "img");
  const res = await timedFetch(ctx, JEV_IMAGE_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "TypeSafe-Danger-Zone-Images": "true" },
    body: form,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { answers?: Record<string, any> };
  const p = body.answers?.present?.noul;
  if (typeof p !== "number" || !(p >= 0 && p <= 1)) throw new Error("no yes/no answer");
  if (p < JEV_PRESENT_THRESHOLD) return [];
  const b = body.answers?.where?.box;
  const top = frac(b?.top), bottom = frac(b?.bottom), left = frac(b?.left), right = frac(b?.right);
  if (top === null || bottom === null || left === null || right === null || bottom <= top || right <= left) return [];
  // Box confidence is uncalibrated; use the gate probability.
  return [
    {
      box: { x: r2(left * img.coord.w), y: r2(top * img.coord.h), w: r2((right - left) * img.coord.w), h: r2((bottom - top) * img.coord.h) },
      kind: "table",
      label: "table or chart",
      source: "jev",
      confidence: Math.min(0.9, p),
    },
  ];
};
