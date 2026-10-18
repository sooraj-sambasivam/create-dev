import { NodeSchema, ScreenSchema, sanitizeScreen, type Screen } from "@create/shared";
import { extractPartialScreen } from "./partialJson";

/**
 * Turns the growing render_screen tool input into partial Screens. A screen is emitted each
 * time at least one more top-level section completes AND validates with NodeSchema (after the
 * same sanitize as the final path). Sections that fail validation are skipped.
 */
export function createPartialScreenBuilder(onPartial: (screen: Screen) => void) {
  let seen = 0;
  let emitted = 0;
  return {
    push(json: string): void {
      const { fields, children } = extractPartialScreen(json);
      if (children.length <= seen) return;
      seen = children.length;
      const clean = sanitizeScreen({ ...fields, children }) as { children: unknown[] } & Record<string, unknown>;
      const valid = clean.children.filter((c) => NodeSchema.safeParse(c).success);
      if (valid.length <= emitted) return;
      const screen = ScreenSchema.safeParse({ title: "Untitled", ...clean, children: valid });
      if (!screen.success) return;
      emitted = valid.length;
      onPartial(screen.data);
    },
  };
}
