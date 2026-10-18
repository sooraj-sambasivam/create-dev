import type { SketchRequest } from "@create/shared";
import { SYSTEM_PROMPT } from "../ai/prompt";
import { SKETCH_INSTRUCTIONS, buildSketchMessage } from "../sketch/claude";

const TOOL_SENTENCE = "Always answer by calling the provided tool exactly once with the full result.";

const JSON_SENTENCE =
  'Always answer with one JSON object {"summary","screen"} and no other text. Never return HTML, innerHTML, markdown, or tool calls.';

/**
 * Create's designer prompt, retargeted from a tool call to an Abel screen tree.
 * Sketch instructions replace the drawing-frontend HTML operation contract.
 */
export function buildSystemPrompt(): string {
  const body = SYSTEM_PROMPT.includes(TOOL_SENTENCE)
    ? SYSTEM_PROMPT.replace(TOOL_SENTENCE, JSON_SENTENCE)
    : `${SYSTEM_PROMPT}\n\n${JSON_SENTENCE}`;
  return [
    body,
    SKETCH_INSTRUCTIONS,
    "The screen you return is the whole page. Use only the element types above. Do not emit operations, css, script, html, or innerHTML.",
  ].join("\n\n");
}

export function jsonShapeHint(): string {
  return 'JSON shape: {"summary":"one or two sentences","screen":{"title":"Page title","theme":"light","accent":"#4f46e5","font":"sans","children":[{"id":"hero-title","type":"heading","text":"Welcome","level":1},{"id":"hero-cta","type":"button","label":"Sign up","variant":"primary","href":"#hero-title"}]}}';
}

export function buildUserPrompt(req: SketchRequest): string {
  return [
    buildSketchMessage(req),
    "The attached image is the wireframe. Shapes supply coordinates and exact copy.",
    "Return one JSON object only. The screen tree is the page. Do not return HTML or innerHTML.",
    jsonShapeHint(),
  ].join("\n\n");
}

export function buildRepairPrompt(issues: string): string {
  return [
    "The previous JSON failed ScreenSchema validation.",
    'Return one JSON object only: {"summary","screen"}.',
    "Do not return HTML, innerHTML, markdown, or operations.",
    "Fix these problems:",
    issues,
    jsonShapeHint(),
  ].join("\n");
}
