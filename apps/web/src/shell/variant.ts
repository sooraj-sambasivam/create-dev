/**
 * Dev-only palette variants for choosing between refined-minimal token sets: ?variant=graphite|warm|ink.
 * Token sets only (index.css keys them on html[data-variant]); layout, type and radius never change.
 * Without the param, or in a production build, the default refined minimal look applies.
 */
export const VARIANTS = ["graphite", "warm", "ink"] as const;
export type Variant = (typeof VARIANTS)[number];

/** The variant named by a location.search string, or null. */
export function variantFromSearch(search: string): Variant | null {
  const v = new URLSearchParams(search).get("variant");
  return (VARIANTS as readonly string[]).includes(v ?? "") ? (v as Variant) : null;
}

/** Sets or clears html[data-variant]. Does nothing outside a browser. */
export function applyVariant(variant: Variant | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (variant) root.setAttribute("data-variant", variant);
  else root.removeAttribute("data-variant");
}

/** Reads ?variant= and applies it. Only honoured in dev builds. */
export function applyVariantFromLocation(dev: boolean): void {
  if (!dev || typeof window === "undefined") return;
  applyVariant(variantFromSearch(window.location.search));
}
