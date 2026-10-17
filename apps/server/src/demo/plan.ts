import { z } from "zod";
import type { NarrationSession, Screen } from "@create/shared";

export const MAX_SECTIONS = 6;

export const PlanSchema = z.object({
  title: z.string().min(1).max(120),
  sections: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        purpose: z.string().min(1).max(200),
        content: z.string().max(1500).default(""),
      }),
    )
    .min(1)
    .max(MAX_SECTIONS),
});
export type Plan = z.infer<typeof PlanSchema>;
export type PlanSection = Plan["sections"][number];

export function slug(text: string, fallback = "section"): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return s || fallback;
}

export function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Make `id` unique against `taken` (and record it). Deterministic. */
export function takeId(taken: Set<string>, id: string): string {
  let out = id;
  for (let n = 2; taken.has(out); n++) out = `${id}-${n}`;
  taken.add(out);
  return out;
}

export interface SessionDigest {
  /** Final speech lines in order. */
  speech: string[];
  notes: string[];
  /** Unique lasso targets (labels), in the order they were pointed at. */
  targets: { id: string; label: string; kind: "node" | "shape" }[];
}

export function digestSession(session: NarrationSession): SessionDigest {
  const events = [...session.events].sort((a, b) => a.t - b.t);
  const speech: string[] = [];
  const notes: string[] = [];
  const targets: SessionDigest["targets"] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (e.kind === "speech") {
      // Interim lines repeat their final form, so keep finals only.
      const text = e.text.trim();
      if (text && e.final) speech.push(text);
    } else if (e.kind === "note") {
      if (e.text.trim()) notes.push(e.text.trim());
    } else {
      for (const t of e.targets) {
        const key = t.label.trim().toLowerCase() || t.id;
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({ id: t.id, label: t.label.trim() || t.id, kind: t.kind });
      }
    }
  }
  if (speech.length === 0) {
    // Only interim transcripts were recorded: use the last one.
    const interim = events.filter((e): e is Extract<typeof e, { kind: "speech" }> => e.kind === "speech").map((e) => e.text.trim()).filter(Boolean);
    if (interim.length) speech.push(interim[interim.length - 1]);
  }
  return { speech, notes, targets };
}

/** Top-level outline of the current screen for the planner. */
export function outlineScreen(screen: Screen | null | undefined): { id: string; type: string; text?: string }[] {
  if (!screen) return [];
  return screen.children.map((n) => {
    let text: string | undefined;
    const find = (nodes: Screen["children"]): string | undefined => {
      for (const c of nodes) {
        if (c.type === "heading" || c.type === "text") return c.text;
        if (c.type === "container") {
          const r = find(c.children);
          if (r) return r;
        }
      }
      return undefined;
    };
    if (n.type === "heading" || n.type === "text") text = n.text;
    else if (n.type === "container") text = find(n.children);
    return { id: n.id, type: n.type, text: text?.slice(0, 80) };
  });
}

/** Deterministic plan from the session alone (also the fallback when the planner model fails). */
export function mockPlan(session: NarrationSession, screen?: Screen | null): Plan {
  const d = digestSession(session);
  const first = d.speech[0] ?? d.notes[0] ?? screen?.title ?? "My page";
  const words = first.replace(/[.!?]+$/g, "").split(/\s+/).slice(0, 6).join(" ");
  const title = titleCase(words).slice(0, 80) || "My page";

  const taken = new Set<string>(screen?.children.map((c) => c.id) ?? []);
  const sections: PlanSection[] = [];
  const add = (purpose: string, content: string) => {
    if (sections.length >= MAX_SECTIONS) return;
    sections.push({ id: takeId(taken, slug(purpose)), purpose: purpose.slice(0, 200), content: content.slice(0, 1500) });
  };
  const rest = d.speech.slice(1);
  d.targets.slice(0, 4).forEach((t, i) => add(titleCase(t.label), rest[i] ?? d.notes[i] ?? `Details about ${t.label}.`));
  d.notes.slice(0, 6).forEach((n) => {
    if (sections.length < MAX_SECTIONS && !sections.some((s) => s.content === n)) add(titleCase(n.split(/\s+/).slice(0, 3).join(" ")), n);
  });
  if (sections.length === 0) {
    rest.slice(0, 3).forEach((line, i) => add(titleCase(line.split(/\s+/).slice(0, 3).join(" ")) || `Section ${i + 1}`, line));
  }
  if (sections.length === 0) add("About", first);
  return { title, sections };
}
