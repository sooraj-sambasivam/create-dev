import type { ProfileIntent, ProfileLevel } from "./profile";
import type { WorkMode } from "../store/modeStore";

/** Pure step logic for first-run onboarding, kept apart from the UI so it can be tested. */
export const STEP_COUNT = 3;
export type StepIndex = 0 | 1 | 2;

export const INTENT_OPTIONS: { id: ProfileIntent; label: string; hint: string }[] = [
  { id: "build", label: "Build something", hint: "Describe it and watch the page appear." },
  { id: "ask", label: "Ask about something", hint: "Get answers about a page without changing it." },
  { id: "both", label: "Both", hint: "Switch between asking and building any time." },
];

export const LEVEL_OPTIONS: { id: ProfileLevel; label: string; hint: string }[] = [
  { id: "none", label: "I don't code", hint: "Plain words only. No code or technical detail." },
  { id: "some", label: "I code sometimes", hint: "Plain words, with a little detail when it helps." },
  { id: "dev", label: "I'm a developer", hint: "Adds endpoints, JSON and code export." },
];

/** Asking starts in Chat; building (or both) starts in Code. */
export function defaultModeFor(intent: ProfileIntent): WorkMode {
  return intent === "ask" ? "chat" : "code";
}

export function clampStep(step: number): StepIndex {
  return Math.min(STEP_COUNT - 1, Math.max(0, Math.round(step))) as StepIndex;
}

export const nextStep = (step: StepIndex): StepIndex => clampStep(step + 1);
export const prevStep = (step: StepIndex): StepIndex => clampStep(step - 1);
export const isLastStep = (step: StepIndex) => step === STEP_COUNT - 1;

/** The try-pointing hint depends on the mode the user will start in. */
export function pointingHint(mode: WorkMode): string {
  return mode === "chat"
    ? "Point at 4.9 and ask 'what does this mean?'"
    : "Hover the heading and say 'make this bigger'";
}

export type SampleReply = { kind: "answer"; text: string } | { kind: "bigger" } | null;

/** What the step 3 sample does with a typed command. Only the two suggested phrases are understood. */
export function sampleReply(input: string): SampleReply {
  const t = input.toLowerCase().replace(/[?.!]+$/g, "").replace(/\s+/g, " ").trim();
  if (t === "what does this mean") return { kind: "answer", text: "4.9 is the average star rating, out of 5, from 212 reviews." };
  if (t === "make this bigger") return { kind: "bigger" };
  return null;
}

/** Heading text sizes (px) for "make this bigger"; each step grows one notch and stops at the last. */
export const HEADING_SIZES = [16, 20, 24] as const;
export const growHeading = (i: number): number => Math.min(HEADING_SIZES.length - 1, Math.max(0, i + 1));

/** Onboarding shows on first run, or when ?onboarding=1 is present. Never on the shared viewer. */
export function shouldShowOnboarding(onboarded: boolean, search: string, sharedId: string | null): boolean {
  if (sharedId) return false;
  return !onboarded || new URLSearchParams(search).get("onboarding") === "1";
}

export type MicResult = "granted" | "denied" | "unsupported";

/** Asks for the microphone once and releases it straight away. Never throws. */
export async function requestMic(
  md: Pick<MediaDevices, "getUserMedia"> | undefined = typeof navigator === "undefined" ? undefined : navigator.mediaDevices,
): Promise<MicResult> {
  if (!md?.getUserMedia) return "unsupported";
  try {
    const stream = await md.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return "granted";
  } catch {
    return "denied";
  }
}

/** Short text for the avatar menu's setup entry. */
export function setupSummary(intent: ProfileIntent, level: ProfileLevel): string {
  const i = INTENT_OPTIONS.find((o) => o.id === intent)?.label ?? intent;
  const l = LEVEL_OPTIONS.find((o) => o.id === level)?.label ?? level;
  return `${i} · ${l}`;
}
