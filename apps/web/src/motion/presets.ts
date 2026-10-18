/** Animation presets applied through generated CSS, so Abel's renderer is never touched. */

export const MOTION_PRESET_IDS = ["fade-in", "slide-up", "slide-left", "zoom-in", "pop", "float", "pulse", "marquee"] as const;
export type MotionPreset = (typeof MOTION_PRESET_IDS)[number];

export interface PresetDef {
  id: MotionPreset;
  label: string;
  loop: boolean;
  /** Keyframes body, without the @keyframes wrapper. */
  frames: string;
  /** Value of the `animation` property. */
  animation: string;
}

const kf = (id: MotionPreset) => `cd-motion-${id}`;

export const PRESETS: Record<MotionPreset, PresetDef> = {
  "fade-in": {
    id: "fade-in", label: "Fade in", loop: false,
    frames: "from{opacity:0}to{opacity:1}",
    animation: `${kf("fade-in")} 600ms ease-out both`,
  },
  "slide-up": {
    id: "slide-up", label: "Slide up", loop: false,
    frames: "from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}",
    animation: `${kf("slide-up")} 600ms cubic-bezier(.2,.8,.2,1) both`,
  },
  "slide-left": {
    id: "slide-left", label: "Slide left", loop: false,
    frames: "from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:none}",
    animation: `${kf("slide-left")} 600ms cubic-bezier(.2,.8,.2,1) both`,
  },
  "zoom-in": {
    id: "zoom-in", label: "Zoom in", loop: false,
    frames: "from{opacity:0;transform:scale(.85)}to{opacity:1;transform:none}",
    animation: `${kf("zoom-in")} 500ms ease-out both`,
  },
  pop: {
    id: "pop", label: "Pop", loop: false,
    frames: "0%{opacity:0;transform:scale(.6)}60%{opacity:1;transform:scale(1.08)}100%{transform:scale(1)}",
    animation: `${kf("pop")} 500ms ease-out both`,
  },
  float: {
    id: "float", label: "Float", loop: true,
    frames: "0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}",
    animation: `${kf("float")} 3s ease-in-out infinite`,
  },
  pulse: {
    id: "pulse", label: "Pulse", loop: true,
    frames: "0%,100%{transform:scale(1)}50%{transform:scale(1.05)}",
    animation: `${kf("pulse")} 1.8s ease-in-out infinite`,
  },
  marquee: {
    id: "marquee", label: "Marquee", loop: true,
    frames: "from{transform:translateX(100%)}to{transform:translateX(-100%)}",
    animation: `${kf("marquee")} 12s linear infinite`,
  },
};

export function isPreset(v: unknown): v is MotionPreset {
  return typeof v === "string" && (MOTION_PRESET_IDS as readonly string[]).includes(v);
}

/** Escape a node id for use inside a double-quoted CSS attribute selector. */
export function cssAttr(value: string): string {
  return value.replace(/[\\"]/g, "\\$&").replace(/[\n\r\f]/g, " ");
}

export const SCREEN_SCOPE = "[data-screen-root]";

/** Keyframes for the presets in use. */
export function keyframesCss(presets: Iterable<MotionPreset>): string {
  return [...new Set(presets)].map((p) => `@keyframes ${kf(p)}{${PRESETS[p].frames}}`).join("\n");
}

/**
 * CSS for a nodeId -> preset map. Wrapped in prefers-reduced-motion: no-preference so users who
 * ask for less motion get the static page. Unknown presets are skipped.
 */
export function exportMotionCss(map: Record<string, MotionPreset | string>, scope: string = SCREEN_SCOPE): string {
  const entries = Object.entries(map).filter(([, p]) => isPreset(p)) as [string, MotionPreset][];
  if (!entries.length) return "";
  const rules = entries
    .map(([id, p]) => `${scope} [data-node-id="${cssAttr(id)}"]{animation:${PRESETS[p].animation}}`)
    .join("\n");
  return `@media (prefers-reduced-motion: no-preference){\n${keyframesCss(entries.map(([, p]) => p))}\n${rules}\n}`;
}
