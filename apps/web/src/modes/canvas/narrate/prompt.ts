import type { Utterance } from "./align";

/** What the prompt needs to name a shape. */
export type TargetInfo = { id: string; type: string; geo?: string; text?: string };

export const MAX_PROMPT = 4000;

/** "rect 'Hero' (id shape:abc)" */
export function describeTarget(t: TargetInfo): string {
  const kind = t.type === "geo" ? (t.geo === "rectangle" ? "rect" : t.geo || "shape") : t.type;
  const text = t.text?.replace(/\s+/g, " ").trim();
  const label = text ? ` '${text.length > 40 ? `${text.slice(0, 39)}…` : text}'` : "";
  return `${kind}${label} (id ${t.id})`;
}

/** Annotates each utterance with the shapes pointed at during it. Stays within the request's 4000 chars. */
export function buildPrompt(utterances: Utterance[], info: (id: string) => TargetInfo | undefined, max = MAX_PROMPT): string {
  const lines: string[] = [];
  for (const u of utterances) {
    const text = u.text.trim();
    if (!text) continue;
    const parts = u.targetIds.map((id) => info(id)).filter((x): x is TargetInfo => !!x).map(describeTarget);
    lines.push(parts.length ? `[pointing at ${parts.join(", ")}] ${text}` : text);
  }
  let out = lines.join("\n");
  // Over budget: drop the oldest lines first, the latest instructions matter most.
  while (out.length > max && lines.length > 1) {
    lines.shift();
    out = lines.join("\n");
  }
  return out.length > max ? out.slice(0, max) : out;
}
