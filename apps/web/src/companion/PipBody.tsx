import type { Look } from "../ui/look";
import type { FaceTone } from "./Face";

/** The blot's silhouette and its three splatter dots, in the 60x60 face box. */
export const BLOT_PATH =
  "M30 5 C41 4 52 11 54 23 C56 32 53 39 50 46 C46 54 36 57 27 55 C17 54 8 48 6 36 C4 26 9 16 17 11 C21 8 25 5 30 5Z";
export const SPLATTER: readonly { cx: number; cy: number; r: number }[] = [
  { cx: 55, cy: 8, r: 2.2 },
  { cx: 6, cy: 53, r: 1.8 },
  { cx: 57, cy: 47, r: 1.5 },
];

/** Which face colours sit on each look's body. */
export const faceTone = (look: Look): FaceTone => (look === "paper" ? "light" : "dark");

/** Class names for the Pip button per look: Paper has no card behind the blot, Luminous glows. */
export const pipButtonClass = (look: Look): string =>
  look === "paper" ? "rounded-full bg-transparent" : "rounded-full border-0 bg-transparent";

/**
 * Pip's body. Paper: an ink blot with splatter. Luminous: a light orb with a soft magenta glow.
 * Decorative only (the face and the live regions carry the meaning).
 */
export function PipBody({ look }: { look: Look }) {
  if (look === "paper") {
    return (
      <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true" className="absolute inset-0 block" data-pip-body="blot">
        <path d={BLOT_PATH} style={{ fill: "var(--color-ink)" }} />
        {SPLATTER.map((d) => (
          <circle key={`${d.cx}-${d.cy}`} cx={d.cx} cy={d.cy} r={d.r} style={{ fill: "var(--color-ink)" }} />
        ))}
        <path d="M14 20 C16 14 22 10 28 9" fill="none" strokeWidth={2} strokeLinecap="round" style={{ stroke: "var(--color-accent)", opacity: 0.9 }} />
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      data-pip-body="orb"
      className="absolute inset-1 block rounded-full"
      style={{
        background:
          "radial-gradient(circle at 34% 28%, color-mix(in oklab, white 78%, var(--color-pen)) 0%, var(--color-pen) 26%, var(--color-accent) 72%, color-mix(in oklab, black 30%, var(--color-accent)) 100%)",
        boxShadow: "0 0 24px 2px var(--color-glow), 0 0 3px var(--color-accent), inset 0 -6px 12px rgb(0 0 0 / 0.18)",
      }}
    />
  );
}
