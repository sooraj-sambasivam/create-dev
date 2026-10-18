import { ScreenOpsSchema, type CanvasOpsRequest, type ScreenOp } from "@create/shared";
import { indexForY } from "./outline";

type Json = Record<string, unknown>;

function slug(s: string, fallback: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || fallback;
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function sentence(s: string): string {
  const t = clean(s);
  return t ? t[0]!.toUpperCase() + t.slice(1) : "New section";
}

/**
 * Deterministic ops from the label and shapes, inserted at the top-level index matching region.y.
 * Same input, same output (ids are derived from the label; applyOps makes them unique on the page).
 */
export function buildMockOps(req: Pick<CanvasOpsRequest, "label" | "shapes" | "region" | "screen">): { summary: string; ops: ScreenOp[] } {
  const label = clean(req.label) || clean(req.shapes.map((s) => s.text).filter(Boolean).join(" "));
  const lower = label.toLowerCase();
  const index = indexForY(req.screen, req.region.y);
  let node: Json;
  let summary: string;

  const button = /^\s*button\s*:\s*(.+)$/i.exec(label);
  if (button) {
    const text = clean(button[1]);
    node = { id: `button-${slug(text, "action")}`, type: "button", label: text, variant: "primary" };
    summary = `Added a "${text}" button.`;
  } else if (/\b(picture|photo|image|pic|illustration|logo)\b/.test(lower)) {
    // "cat picture" becomes a photo of a cat, searched by the words that are not "picture".
    const subject = clean(lower.replace(/\b(a|an|the|of|picture|photo|image|pic|illustration|logo|here|big|large|small)\b/g, " ")) || "abstract";
    node = { id: `image-${slug(subject, "photo")}`, type: "image", alt: sentence(`A photo of ${subject}`), query: subject, size: "full", aspect: "video" };
    summary = `Added a photo of ${subject}.`;
  } else if (/^\s*(add\s+)?(a\s+)?(heading|title|headline)\b/.test(lower)) {
    // "add a heading greeting users here" becomes the heading the user described, not the instruction.
    const about = clean(lower.replace(/^\s*(add\s+)?(a\s+)?(heading|title|headline)\s*/, "").replace(/\b(here|that says|saying)\b/g, " "));
    const text = /greet/.test(about) ? "Welcome back" : sentence(about || "Welcome");
    node = { id: `heading-${slug(text, "title")}`, type: "heading", text, level: 1 };
    summary = `Added the heading "${text}".`;
  } else if (/pricing|plans?\b/.test(lower)) {
    const tier = (name: string, price: string, perks: string[], accent: boolean): Json => ({
      id: `plan-${slug(name, "tier")}`,
      type: "container",
      background: accent ? "accent" : "surface",
      padding: "lg",
      gap: "md",
      widthPct: 30,
      children: [
        { id: `plan-${slug(name, "tier")}-name`, type: "heading", text: name, level: 3 },
        { id: `plan-${slug(name, "tier")}-price`, type: "heading", text: price, level: 2 },
        { id: `plan-${slug(name, "tier")}-perks`, type: "list", items: perks, marker: "check" },
        { id: `plan-${slug(name, "tier")}-cta`, type: "button", label: "Choose plan", variant: accent ? "secondary" : "primary" },
      ],
    });
    node = {
      id: "pricing",
      type: "container",
      direction: "column",
      padding: "xl",
      gap: "lg",
      align: "center",
      children: [
        { id: "pricing-title", type: "heading", text: "Simple pricing", level: 2 },
        {
          id: "pricing-cards",
          type: "container",
          direction: "row",
          gap: "md",
          justify: "center",
          wrap: true,
          children: [
            tier("Starter", "$9/mo", ["1 project", "Email support"], false),
            tier("Pro", "$29/mo", ["Unlimited projects", "Priority support", "Analytics"], true),
            tier("Team", "$79/mo", ["Everything in Pro", "10 seats", "SSO"], false),
          ],
        },
      ],
    };
    summary = "Added a three-plan pricing section.";
  } else {
    const title = sentence(label);
    const base = slug(label, "section");
    node = {
      id: `${base}-section`,
      type: "container",
      padding: "xl",
      gap: "sm",
      children: [
        { id: `${base}-title`, type: "heading", text: title, level: 2 },
        { id: `${base}-text`, type: "text", text: `Details about ${title.toLowerCase()} go here.`, tone: "muted" },
      ],
    };
    summary = `Added a "${title}" section.`;
  }

  // Parsing fills schema defaults, so the ops are exactly what the model path would produce.
  return { summary, ops: ScreenOpsSchema.parse([{ op: "insert", parentId: null, index, node }]) };
}
