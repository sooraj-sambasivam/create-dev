import type { ProfileIntent, ProfileLevel } from "./profile";
import type { WorkMode } from "../store/modeStore";

/** Pure step logic for first-run onboarding, kept apart from the UI so it can be tested. */
export const STEP_COUNT = 6;
export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5;
export const STEP = { welcome: 0, look: 1, you: 2, permissions: 3, tryIt: 4, done: 5 } as const;
/** Bump when the flow gains a step that existing users should see. */
export const ONBOARDING_VERSION = 3;

export const INTENT_OPTIONS: { id: ProfileIntent; label: string; hint: string }[] = [
  { id: "build", label: "Build", hint: "Describe it and watch the page appear." },
  { id: "ask", label: "Ask", hint: "Get answers about a page without changing it." },
  { id: "both", label: "Both", hint: "Switch between asking and building any time." },
];

export const LEVEL_OPTIONS: { id: ProfileLevel; label: string; hint: string }[] = [
  { id: "none", label: "Not at all", hint: "Plain words only. No code or technical detail." },
  { id: "some", label: "A little", hint: "Plain words, with a little detail when it helps." },
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

/** The Try it instruction depends on the path being tried. Narrate edits the page; Chat answers about it. */
export function pointingHint(mode: WorkMode): string {
  return mode === "chat"
    ? "Point at 4.9 and ask \u201cwhat does 4.9 mean?\u201d"
    : "Hover the heading, then say or type \u201cmake this bigger\u201d.";
}

export type SampleReply = { kind: "answer"; text: string } | { kind: "bigger" } | null;

const BIGGER = new Set(["make this bigger", "make it bigger", "bigger", "make this larger", "make it larger", "increase size", "increase the size", "make the heading bigger", "make heading bigger"]);
const MEANING = new Set(["what does this mean", "what does that mean", "what does 4.9 mean", "what is 4.9", "whats 4.9", "what is this", "what does it mean"]);

/** What the Try it sample does with a typed command. Close variants of the two suggested phrases are understood. */
export function sampleReply(input: string): SampleReply {
  const t = input
    .toLowerCase()
    .replace(/[\u2018\u2019'`\u201c\u201d"]/g, "")
    .replace(/[?.!,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (MEANING.has(t)) return { kind: "answer", text: "4.9 is the average star rating, out of 5, from 212 reviews." };
  if (BIGGER.has(t)) return { kind: "bigger" };
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

export type MicResult = "granted" | "denied" | "unsupported" | "no-device";

/** Maps a getUserMedia failure to what the person can act on. Never "denied" for a missing device. */
export function classifyMicError(name: string | undefined): Exclude<MicResult, "granted" | "unsupported"> {
  return name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError" ? "no-device" : "denied";
}

/** Opens the microphone. The caller owns the stream and must stop it. Never throws. */
export async function openMic(
  md: Pick<MediaDevices, "getUserMedia"> | undefined = typeof navigator === "undefined" ? undefined : navigator.mediaDevices,
  deviceId?: string | null,
): Promise<{ result: MicResult; stream?: MediaStream }> {
  if (!md?.getUserMedia) return { result: "unsupported" };
  try {
    const stream = await md.getUserMedia({ audio: deviceId ? { deviceId: { ideal: deviceId } } : true });
    return { result: "granted", stream };
  } catch (e) {
    return { result: classifyMicError((e as { name?: string } | null)?.name) };
  }
}

/** Asks for the microphone once and releases it straight away. Never throws. */
export async function requestMic(
  md: Pick<MediaDevices, "getUserMedia"> | undefined = typeof navigator === "undefined" ? undefined : navigator.mediaDevices,
): Promise<MicResult> {
  const { result, stream } = await openMic(md);
  stream?.getTracks().forEach((t) => t.stop());
  return result;
}

/** What the UI shows. The browser is the source of truth; this record is only a hint. */
export type PermState = "unknown" | "granted" | "not-now" | "blocked";

/** Folds a Permissions API answer (or null when unsupported) and the last open result into a display state. */
export function micStatus(query: PermissionState | null, last: MicResult | null, current: PermState): PermState {
  if (query === "granted") return "granted";
  if (query === "denied") return "blocked";
  if (last === "granted") return "granted";
  if (last === "denied") return "blocked";
  if (last === "no-device" || last === "unsupported") return "not-now";
  return current === "granted" ? "not-now" : current;
}

export type Browser = "chrome" | "safari" | "other";

export function detectBrowser(ua: string): Browser {
  if (/Edg\/|Chrome\/|CriOS\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "safari";
  return "other";
}

/** How to unblock the microphone, for the browser in use. */
export function browserFixCopy(ua: string): string {
  switch (detectBrowser(ua)) {
    case "chrome":
      return "Click the tune icon left of the address bar, switch Microphone to Allow, then press Check again.";
    case "safari":
      return "In the Safari menu, open Settings for This Website, set Microphone to Allow, then press Check again.";
    default:
      return "Allow the microphone for this site in your browser\u2019s site settings, then press Check again.";
  }
}

export const isMacPlatform = (platform: string) => /mac|iphone|ipad/i.test(platform);

/** Level (0 to 1) from time-domain bytes (128 is silence). */
export function levelFromBytes(bytes: ArrayLike<number>): number {
  if (!bytes.length) return 0;
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    const v = (bytes[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / bytes.length) * 4);
}

export const MODE_LABEL: Record<WorkMode, string> = { chat: "Chat", code: "Code" };

/** Short text for the avatar menu's setup entry. */
export function setupSummary(intent: ProfileIntent, level: ProfileLevel): string {
  const i = INTENT_OPTIONS.find((o) => o.id === intent)?.label ?? intent;
  const l = LEVEL_OPTIONS.find((o) => o.id === level)?.label ?? level;
  return `${i} · ${l}`;
}
