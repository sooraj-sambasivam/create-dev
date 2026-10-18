import { findNode, type EditNodeRequest, type EditNodeResponse, type Node, type Style } from "@create/shared";

/**
 * Deterministic edit-node used when MOCK_AI is set, there is no key, or the model fails.
 * Reads the prompt for bigger/smaller, colour words, bold, centre, remove and rewrite, and always
 * returns a node that differs from the input, so a pointer edit is visible even without a model.
 */

const FONT_STEPS = ["sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"] as const;
const DEFAULT_FONT: Record<string, (typeof FONT_STEPS)[number]> = { heading: "3xl", text: "base", button: "base", link: "base", badge: "sm" };
const TEXT_FIELD: Record<string, string> = { heading: "text", text: "text", button: "label", link: "text", badge: "text" };
const COLORS: Record<string, string> = {
  blue: "#2563eb", red: "#dc2626", green: "#16a34a", black: "#111111", white: "#ffffff", pink: "#ec4899",
  purple: "#7c3aed", yellow: "#eab308", orange: "#f97316", gray: "#6b7280", grey: "#6b7280", teal: "#0d9488", dark: "#111827",
};

export function mockEditNode(req: EditNodeRequest): EditNodeResponse {
  const target = findNode(req.screen, req.nodeId);
  if (!target) {
    const err = new Error("That element no longer exists. Select it again.") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  const text = req.prompt.toLowerCase();
  const has = (re: RegExp) => re.test(text);

  if (has(/\b(delete|remove|erase|get rid of|trash)\b/)) return { summary: "Removed the element.", nodes: [] };

  const node = structuredClone(target) as Node & { style?: Style | null; widthPct?: number | null };
  const style: Style = { ...(node.style ?? {}) };
  const done: string[] = [];
  const field = TEXT_FIELD[node.type];

  const dir = has(/\b(bigger|larger|enlarge|grow|wider|taller|increase)\b/) ? 1 : has(/\b(smaller|shrink|narrower|shorter|reduce|decrease)\b/) ? -1 : 0;
  if (dir !== 0) {
    if (field) {
      const cur = FONT_STEPS.indexOf(style.fontSize ?? DEFAULT_FONT[node.type] ?? "base");
      style.fontSize = FONT_STEPS[Math.min(FONT_STEPS.length - 1, Math.max(0, cur + dir))];
      done.push(dir > 0 ? "made it bigger" : "made it smaller");
    } else {
      const cur = node.widthPct ?? 60;
      node.widthPct = Math.min(100, Math.max(10, cur + dir * 20));
      done.push(dir > 0 ? "made it wider" : "made it narrower");
    }
  }

  const colorWord = Object.keys(COLORS).find((w) => new RegExp(`\\b${w}\\b`).test(text));
  if (colorWord) {
    const hex = COLORS[colorWord]!;
    if (has(/\b(background|fill)\b/) || node.type === "button" || node.type === "container" || node.type === "badge") {
      style.background = hex;
      if (node.type === "button" || node.type === "badge") style.color = colorWord === "white" || colorWord === "yellow" ? "#111111" : "#ffffff";
    } else {
      style.color = hex;
    }
    done.push(`made it ${colorWord}`);
  }

  if (has(/\b(bold|heavier)\b/)) {
    style.weight = "bold";
    done.push("made it bold");
  }
  if (has(/\b(center|centre|centred|centered|middle)\b/)) {
    style.align = "center";
    done.push("centered it");
  }

  const media = has(/\b(photo|image|picture|swap|replace)\b/) && (node.type === "image" || node.type === "avatar");
  if (media) {
    const m = /\b(?:of|with|to|for)\s+(?:an?\s+|the\s+)?([a-z][a-z' -]{2,40})$/.exec(text.trim().replace(/[.!?]+$/, ""));
    const query = m?.[1]?.trim() || `${"alt" in node ? node.alt : "photo"} alternate`;
    Object.assign(node, { query, src: null });
    done.push(`swapped the photo for "${query}"`);
  }

  if (field && has(/\b(rewrite|reword|rephrase|say|says|change|text|caption|title|shorter)\b/) && dir === 0 && !colorWord) {
    const record = node as unknown as Record<string, string>;
    const old = record[field] ?? "";
    const quoted = /["“'‘]([^"”’]{1,200})["”’]/.exec(req.prompt)?.[1] ?? /\b(?:to say|to read|say|says|to)\s+(.{2,200})$/i.exec(req.prompt.trim())?.[1];
    const next = quoted ? quoted.replace(/[.!?]+$/, "").trim() : old ? `${old.replace(/[.!?]+$/, "")}, refined` : "Updated";
    if (next && next !== old) {
      record[field] = next;
      done.push("rewrote the text");
    }
  }

  if (done.length === 0) {
    style.weight = style.weight === "bold" ? "black" : "bold";
    done.push("emphasized it");
  }
  node.style = style;
  const summary = done[0]!.charAt(0).toUpperCase() + done.join(", ").slice(1) + ".";
  return { summary, nodes: [node as Node] };
}
