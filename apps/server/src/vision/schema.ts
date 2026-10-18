import {
  GenerateResponseSchema,
  ScreenSchema,
  preserveStyles,
  sanitizeScreen,
  type GenerateResponse,
  type SketchRequest,
} from "@create/shared";
import { ZodError } from "zod";

const MARKUP_KEYS = new Set(["html", "innerHTML", "innerHtml"]);

/**
 * Accept model text only when it is an Abel screen.
 * ScreenSchema.parse is the gate; callers get one repair round when this throws.
 */
export function parseAbelScreen(content: string, req: SketchRequest): GenerateResponse {
  const raw = extractJsonObject(content);
  if (containsMarkup(raw)) {
    throw new Error("Return an Abel screen tree. Do not include html or innerHTML.");
  }
  if (typeof raw.summary !== "string" || !raw.summary.trim()) {
    throw new Error("summary must be a non-empty string");
  }
  if (!raw.screen || typeof raw.screen !== "object" || Array.isArray(raw.screen)) {
    throw new Error("Expected a screen object. Return Abel screen JSON, not HTML or operations.");
  }
  const screenObj = raw.screen as Record<string, unknown>;
  if (!Array.isArray(screenObj.children)) {
    throw new Error("screen.children must be an array. Do not return HTML.");
  }

  const notes: string[] = [];
  const screen = ScreenSchema.parse(sanitizeScreen(screenObj, notes));
  let next = preserveStyles(req.screen, screen);
  if (req.screen?.accent && !next.accent) next = { ...next, accent: req.screen.accent };
  const unique = [...new Set(notes)];
  const summary = unique.length ? `${raw.summary.trim()} ${unique.join(" ")}` : raw.summary.trim();
  return GenerateResponseSchema.parse({ summary, screen: next });
}

export function formatVisionProblem(err: unknown): string {
  if (isZodError(err)) {
    return err.issues
      .slice(0, 8)
      .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return "The model did not return a screen.";
}

export function extractJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Vision model did not return JSON");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("Vision model returned invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Vision model did not return a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function containsMarkup(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsMarkup);
  for (const [key, child] of Object.entries(value)) {
    if (MARKUP_KEYS.has(key)) return true;
    if (containsMarkup(child)) return true;
  }
  return false;
}

function isZodError(err: unknown): err is ZodError {
  return err instanceof ZodError || (typeof err === "object" && err !== null && Array.isArray((err as ZodError).issues));
}
