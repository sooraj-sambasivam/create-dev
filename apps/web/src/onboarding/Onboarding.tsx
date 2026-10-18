import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { duration, ease, fade, sharedAxis, spring, useReducedMotionSafe } from "../ui/motion";
import { Check, Crosshair, Keyboard, Mic } from "lucide-react";
import { useProfile, type ProfileIntent, type ProfileLevel } from "./profile";
import { usePermissions } from "./permissions";
import { useWorkMode, type WorkMode } from "../store/modeStore";
import { useOnboarding } from "./onboardingStore";
import { useMic } from "./useMic";
import { MicBody } from "./MicBody";
import { ChoiceGroup, KeyCap, SegmentedControl, StatusPill } from "./controls";
import { LookPicker } from "./LookPicker";
import { LOOK_LABEL, useLook } from "../ui/look";
import { button, focusRing, ICON, input, STROKE, surface, text } from "../ui/styles";
import {
  HEADING_SIZES,
  INTENT_OPTIONS,
  LEVEL_OPTIONS,
  MODE_LABEL,
  ONBOARDING_VERSION,
  STEP,
  STEP_COUNT,
  defaultModeFor,
  growHeading,
  isLastStep,
  isMacPlatform,
  nextStep,
  pointingHint,
  prevStep,
  sampleReply,
  type StepIndex,
} from "./steps";

const TITLES = [
  "Point at anything. Say what you want. Get software you own.",
  "Choose your look",
  "Tell us how you’ll use it",
  "Set up your microphone",
  "Try it",
  "You’re set",
];
const lg = { size: ICON.lg, strokeWidth: STROKE } as const;
const card = "onb-card";
const optionOf = <T extends { id: string; label: string; hint: string }>(list: T[], id: string) => list.find((o) => o.id === id);

/** The pointer chip, same look as the live one in the Narrate overlay (modes/narrate/overlay/PointerBubble.tsx). */
function PointerChipView({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`onb-chip pointer-events-none ${className}`}>
      <Crosshair size={12} strokeWidth={STROKE} className="shrink-0 text-ink-2" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** Loops: plain card, chip appears on the rating, caption types, heading grows. Static final frame under reduced motion. */
function WelcomePreview({ reduce }: { reduce: boolean | null }) {
  const [phase, setPhase] = useState(reduce ? 3 : 0);
  useEffect(() => {
    if (reduce) {
      setPhase(3);
      return;
    }
    const t = setInterval(() => {
      if (!document.hidden) setPhase((p) => (p + 1) % 5);
    }, 1800);
    return () => clearInterval(t);
  }, [reduce]);
  const big = phase >= 3;
  const tr = reduce ? "none" : "opacity var(--duration-base) var(--ease-standard), transform var(--duration-slow) var(--ease-emphasized)";
  return (
    <>
      <p className="sr-only">Preview: a pointer chip appears over a rating, you say &ldquo;make it bigger&rdquo;, and the heading grows.</p>
      <div aria-hidden="true" className={`${card} relative mx-auto mt-8 w-full max-w-sm text-left`}>
        {/* The heading grows with transform only; its row keeps the final height so nothing below reflows. */}
        <div className="flex h-8 items-center">
          <div style={{ fontSize: 16, transform: `scale(${big ? 1.5 : 1})`, transformOrigin: "left center", transition: tr }} className="font-medium leading-tight text-ink">Corner Coffee</div>
        </div>
        <div className="relative mt-1 w-fit text-[14px] text-ink-2">
          <PointerChipView
            label="Rating · 4.9"
            className="absolute left-full top-1/2 z-10 ml-3 -translate-y-1/2"
          />
          <span className="text-ink">4.9</span> from 212 reviews
        </div>
        <div className="mt-3 flex h-6 items-center text-[12px] text-ink-2" style={{ opacity: phase >= 2 ? 1 : 0, transition: tr }}>
          <Mic size={ICON.sm} strokeWidth={STROKE} className="mr-1.5" />
          &ldquo;make it bigger&rdquo;
        </div>
      </div>
    </>
  );
}

function StepWelcome({ reduce }: { reduce: boolean | null }) {
  return <WelcomePreview reduce={reduce} />;
}

function StepLook() {
  const look = useLook((s) => s.look);
  return (
    <div className="mt-6 flex flex-col gap-4 text-left">
      <LookPicker />
      <p role="status" aria-live="polite" className="sr-only">{LOOK_LABEL[look]} look applied.</p>
      <p className="text-[14px] leading-5 text-ink-2">You can change this anytime in Settings.</p>
    </div>
  );
}

function StepYou({ intent, level, onIntent, onLevel }: { intent: ProfileIntent; level: ProfileLevel; onIntent: (v: ProfileIntent) => void; onLevel: (v: ProfileLevel) => void }) {
  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div id="onb-intent" className={text.ui}>What do you want to do?</div>
        <ChoiceGroup labelId="onb-intent" options={INTENT_OPTIONS} value={intent} onChange={onIntent} />
        <p className="text-[14px] leading-5 text-ink-2">{optionOf(INTENT_OPTIONS, intent)?.hint}</p>
      </div>
      <div className="flex flex-col gap-2">
        <div id="onb-level" className={text.ui}>How comfortable are you with code?</div>
        <ChoiceGroup labelId="onb-level" options={LEVEL_OPTIONS} value={level} onChange={onLevel} />
        <p className="text-[14px] leading-5 text-ink-2">{optionOf(LEVEL_OPTIONS, level)?.hint}</p>
      </div>
      <p className="text-[12px] leading-4 text-ink-2">Build starts in Code. Ask starts in Chat.</p>
    </div>
  );
}

/** Hold-Option test. Active only while the Permissions step is shown. */
function useHoldKeyTest(active: boolean) {
  const [held, setHeld] = useState(false);
  const [works, setWorks] = useState(false);
  useEffect(() => {
    if (!active) return;
    const down = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Alt" || e.repeat) return;
      setHeld(true);
    };
    const up = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Alt") return;
      setHeld(false);
      setWorks(true);
      usePermissions.getState().set({ talkKeyTestedAt: Date.now() });
    };
    const blur = () => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [active]);
  return { held, works };
}

function StepPermissions({ onBusy }: { onBusy: (b: boolean) => void }) {
  const mic = useMic();
  const key = useHoldKeyTest(true);
  const mac = typeof navigator === "undefined" ? true : isMacPlatform(navigator.platform);
  useEffect(() => onBusy(mic.pending), [mic.pending, onBusy]);
  // A grant from an earlier visit needs no prompt: open the stream so the meter works.
  useEffect(() => {
    if (mic.status === "granted" && !mic.live && !mic.pending && !mic.last) void mic.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic.status]);
  return (
    <div className="mt-6 flex flex-col gap-3 text-left">
      <section aria-labelledby="onb-mic" className={card}>
        <div className="flex items-center gap-2">
          <Mic {...lg} className="text-ink-2" aria-hidden="true" />
          <h3 id="onb-mic" className={`${text.ui} flex-1`}>Microphone</h3>
          <StatusPill state={mic.status} />
        </div>
        <p className="mb-3 mt-2 text-[14px] leading-5 text-ink-2">So you can say what to change instead of typing it. The microphone is only on while you hold the key or switch listening on.</p>
        <MicBody mic={mic} onTypeInstead={mic.notNow} />
      </section>
      <section aria-labelledby="onb-key" className={card}>
        <div className="flex items-center gap-2">
          <Keyboard {...lg} className="text-ink-2" aria-hidden="true" />
          <h3 id="onb-key" className={text.ui}>Talk key</h3>
        </div>
        <p className="mb-3 mt-2 text-[14px] leading-5 text-ink-2">Hold {mac ? "Option" : "Alt"} to talk. Tap it to switch listening on or off, double-tap to lock it on.</p>
        <div className="flex flex-wrap items-center gap-3">
          <KeyCap pressed={key.held}>{mac ? "⌥ Option" : "Alt"}</KeyCap>
          <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-[14px] text-ink-2">
            {key.held ? "Listening" : key.works ? (<><Check size={ICON.sm} strokeWidth={STROKE} className="text-ok" aria-hidden="true" />That works</>) : "Press and hold to try it."}
          </span>
        </div>
      </section>
      <details className="text-[14px] leading-5 text-ink-2">
        <summary className={`w-fit cursor-pointer rounded-md py-1 hover:text-ink ${focusRing}`}>Use Create on any website</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Open chrome://extensions and turn on Developer mode.</li>
          <li>Choose Load unpacked, then pick the apps/extension folder.</li>
          <li>On any page, hold {mac ? "Option" : "Alt"} and point at a table or chart.</li>
        </ol>
      </details>
    </div>
  );
}

/** Dictation for the Try it field when the browser offers it; otherwise the button just focuses the field. */
function useDictation(onText: (t: string) => void) {
  const [on, setOn] = useState(false);
  const rec = useRef<{ stop: () => void } | null>(null);
  useEffect(() => () => rec.current?.stop(), []);
  const toggle = () => {
    if (on) { rec.current?.stop(); return false; }
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SR) return false;
    try {
      const r = new SR();
      r.lang = "en-US";
      r.onresult = (e) => onText(e.results[0][0].transcript);
      r.onend = () => setOn(false);
      r.onerror = () => setOn(false);
      rec.current = r;
      r.start();
      setOn(true);
      return true;
    } catch {
      return false;
    }
  };
  return { on, toggle };
}
type SpeechRecognitionLike = { lang: string; onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };

function StepTry({ intent, done, onDone }: { intent: ProfileIntent; done: boolean; onDone: () => void }) {
  const reduce = useReducedMotion();
  const micState = usePermissions((s) => s.mic);
  const [path, setPath] = useState<WorkMode>(defaultModeFor(intent));
  const [sizeIdx, setSizeIdx] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [miss, setMiss] = useState(false);
  const [hover, setHover] = useState<"heading" | "rating" | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const micOn = micState === "granted";

  const run = (value: string) => {
    if (!value.trim()) return;
    const r = sampleReply(value);
    if (r?.kind === "answer") { setAnswer(r.text); setMiss(false); onDone(); }
    else if (r?.kind === "bigger") { setAnswer(null); setSizeIdx(growHeading); setMiss(false); onDone(); }
    else setMiss(true);
  };
  const dictation = useDictation((t) => { setTyped(t); run(t); });
  const onPath = (p: WorkMode) => { setPath(p); setSizeIdx(0); setAnswer(null); setMiss(false); setTyped(""); };
  const hoverCls = "onb-target relative w-fit rounded-md px-1";
  const enter = (h: "heading" | "rating") => () => setHover(h);
  const leave = () => setHover(null);

  return (
    <div className="mt-6 flex flex-col gap-3 text-left">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] leading-5 text-ink-2">{pointingHint(path)}</p>
        <SegmentedControl label="Try" options={[{ id: "code", label: "Narrate" }, { id: "chat", label: MODE_LABEL.chat }]} value={path} onChange={onPath} />
      </div>
      <div data-screen-root className={`${card} pt-8`}>
        <div tabIndex={0} className={`${hoverCls} ${focusRing}`} onPointerEnter={enter("heading")} onPointerLeave={leave} onFocus={enter("heading")} onBlur={leave}>
          {hover === "heading" && <PointerChipView label="Heading · Corner Coffee" className="absolute -top-8 left-0 z-10" />}
          <div className="flex h-8 items-center">
            <motion.h3
              data-node-id="onb-heading"
              style={{ fontSize: HEADING_SIZES[0], transformOrigin: "left center" }}
              animate={{ scale: HEADING_SIZES[sizeIdx] / HEADING_SIZES[0] }}
              transition={reduce ? { duration: 0 } : spring.snappy}
              className="font-medium leading-tight text-ink"
            >
              Corner Coffee
            </motion.h3>
          </div>
        </div>
        <p data-node-id="onb-rating" tabIndex={0} className={`${hoverCls} mt-1 text-[14px] text-ink-2 ${focusRing}`} onPointerEnter={enter("rating")} onPointerLeave={leave} onFocus={enter("rating")} onBlur={leave}>
          {hover === "rating" && <PointerChipView label="Rating · 4.9" className="absolute -top-8 left-0 z-10" />}
          <span className="text-ink">4.9</span> from 212 reviews
        </p>
        <div>
          <span data-node-id="onb-button" className="mt-3 inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[14px] text-surface">Order now</span>
        </div>
        {answer && <div role="status" className={`${surface.card} mt-3 p-2.5 text-[12px] leading-5 text-ink`}>{answer}</div>}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`${button.icon} border border-line bg-surface`}
          aria-label={micOn ? (dictation.on ? "Stop listening" : "Speak") : "Microphone is off"}
          title={micOn ? "Speak" : "Microphone is off. Type instead."}
          aria-pressed={dictation.on}
          disabled={!micOn}
          onClick={() => { if (!dictation.toggle()) field.current?.focus(); }}
        >
          <Mic size={ICON.md} strokeWidth={STROKE} />
        </button>
        <input
          ref={field}
          value={typed}
          autoFocus={!micOn}
          onChange={(e) => { setTyped(e.target.value); setMiss(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); run(typed); } }}
          aria-label="Type instead"
          placeholder="Or type it here"
          className={input}
        />
      </div>
      <p role="status" className="min-h-5 text-[14px] leading-5 text-ink-2">
        {done ? (
          <span className="inline-flex items-center gap-1 text-ink">
            <Check size={ICON.sm} strokeWidth={STROKE} className="text-ok" aria-hidden="true" />
            Nice. That is how {path === "chat" ? "asking" : "editing"} works.
          </span>
        ) : miss ? (
          <>Try &ldquo;{path === "chat" ? "what does 4.9 mean?" : "make this bigger"}&rdquo;.</>
        ) : null}
      </p>
    </div>
  );
}

function StepDone({ intent, level, onFix }: { intent: ProfileIntent; level: ProfileLevel; onFix: () => void }) {
  const perm = usePermissions();
  const mac = typeof navigator === "undefined" ? true : isMacPlatform(navigator.platform);
  const rows: { label: string; value: ReactNode }[] = [
    { label: "You", value: `${optionOf(INTENT_OPTIONS, intent)?.label} · ${optionOf(LEVEL_OPTIONS, level)?.label}` },
    {
      label: "Microphone",
      value: (
        <span className="inline-flex items-center gap-2">
          <StatusPill state={perm.mic} />
          {perm.mic === "blocked" && <button type="button" className={`underline underline-offset-2 ${focusRing}`} onClick={onFix}>Fix</button>}
        </span>
      ),
    },
    { label: "Talk key", value: `Hold ${mac ? "Option" : "Alt"} · ${perm.talkKeyTestedAt ? "Tested" : "Not tested"}` },
    { label: "Starts in", value: MODE_LABEL[defaultModeFor(intent)] },
  ];
  return (
    <div className="mt-6 text-left">
      <dl className="divide-y divide-line border-y border-line">
        {rows.map((r) => (
          <div key={r.label} className="flex min-h-11 items-center justify-between gap-4 py-2 text-[14px]">
            <dt className="text-ink-2">{r.label}</dt>
            <dd className="text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[14px] leading-5 text-ink-2">Change anytime in Settings. Open the avatar menu at the bottom left, then Settings.</p>
    </div>
  );
}

export function Onboarding() {
  const profile = useProfile();
  const setMode = useWorkMode((s) => s.setMode);
  const close = useOnboarding((s) => s.close);
  const reduce = useReducedMotion();
  const { t, v } = useReducedMotionSafe();
  const [step, setStep] = useState<StepIndex>(0);
  // Direction of travel for the shared-axis slide: forward steps enter from the right, Back from the left.
  const travel = useRef({ step: 0 as StepIndex, dir: 1 });
  if (travel.current.step !== step) travel.current = { step, dir: step > travel.current.step ? 1 : -1 };
  const dir = travel.current.dir;
  const [intent, setIntent] = useState<ProfileIntent>(profile.intent);
  const [level, setLevel] = useState<ProfileLevel>(profile.level);
  const [tried, setTried] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Apply as soon as a choice is made so Skip keeps what was picked; the default mode follows intent.
  const pickIntent = (i: ProfileIntent) => {
    setIntent(i);
    profile.set({ intent: i, defaultMode: defaultModeFor(i) });
    setMode(defaultModeFor(i));
  };
  const pickLevel = (l: ProfileLevel) => {
    setLevel(l);
    profile.set({ level: l });
  };
  const finish = (skipped: boolean) => {
    // Finishing keeps the look that was on screen, even if it was only the system default.
    const lk = useLook.getState();
    if (!skipped && !lk.chosen) lk.setLook(lk.look);
    const first = !useProfile.getState().onboarded;
    profile.set({ onboarded: true, onboardingVersion: ONBOARDING_VERSION, ...(first ? { onboardingSkipped: skipped } : {}) });
    close();
    // Drop ?onboarding=1 so a reload does not show it again.
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("onboarding")) {
        u.searchParams.delete("onboarding");
        window.history.replaceState(null, "", u.toString());
      }
    } catch {
      /* non-browser */
    }
  };

  // Lock page scroll while the flow is open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus?.();
  }, []);

  // Each new step reads out from its title.
  useEffect(() => { titleRef.current?.focus(); }, [step]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!micBusy) finish(true);
    } else if (e.key === "Enter" && (e.target === titleRef.current || e.target === rootRef.current)) {
      e.preventDefault();
      if (isLastStep(step)) finish(false);
      else setStep(nextStep(step));
    } else if (e.key === "Tab") {
      const f = rootRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])');
      if (!f?.length) { e.preventDefault(); return; }
      const first = f[0];
      const last = f[f.length - 1];
      const inside = rootRef.current?.contains(document.activeElement) ?? false;
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const welcome = step === STEP.welcome;
  const last = isLastStep(step);
  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onb-title"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="onb-root fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-shell outline-none"
      variants={fade}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      <header className="flex h-14 shrink-0 items-center justify-between px-4 sm:px-6">
        <span className="onb-title text-[18px] text-ink">Create</span>
        <button type="button" onClick={() => finish(true)} aria-label="Skip setup" className={button.ghost}>Skip</button>
      </header>
      <main className={`mx-auto flex w-full flex-1 flex-col justify-center px-4 pb-8 ${step === STEP.look ? "max-w-[720px]" : "max-w-[560px]"}`}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={v(sharedAxis)}
            className={welcome ? "text-center" : ""}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <h2 id="onb-title" ref={titleRef} tabIndex={-1} className="onb-title text-[30px] font-normal leading-9 tracking-[-0.01em] text-ink outline-none">{TITLES[step]}</h2>
            {step === STEP.look && <p className="mt-3 text-[16px] leading-6 text-ink-2">Same app, two moods. Hover a card to see how pointing looks. Your pick applies right away.</p>}
            {step === STEP.you && <p className="mt-3 text-[16px] leading-6 text-ink-2">You can change this any time in Settings.</p>}
            {step === STEP.permissions && <p className="mt-3 text-[16px] leading-6 text-ink-2">Talking is optional. If you&rsquo;d rather type, skip this.</p>}
            {step === STEP.done && <p className="mt-3 text-[16px] leading-6 text-ink-2">Here is what we set up.</p>}
            {step === STEP.welcome && <StepWelcome reduce={reduce} />}
            {step === STEP.look && <StepLook />}
            {step === STEP.you && <StepYou intent={intent} level={level} onIntent={pickIntent} onLevel={pickLevel} />}
            {step === STEP.permissions && <StepPermissions onBusy={setMicBusy} />}
            {step === STEP.tryIt && <StepTry intent={intent} done={tried} onDone={() => setTried(true)} />}
            {step === STEP.done && <StepDone intent={intent} level={level} onFix={() => setStep(STEP.permissions)} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <footer className="mx-auto flex w-full max-w-[560px] shrink-0 flex-col items-center gap-4 px-4 pb-8">
        <div className="flex w-full flex-col-reverse items-stretch justify-between gap-2 min-[480px]:flex-row min-[480px]:items-center">
          <div className="flex gap-2">
            {step > 0 && <button type="button" onClick={() => setStep(prevStep(step))} className={button.ghost}>Back</button>}
            {welcome && <button type="button" onClick={() => setStep(STEP.permissions)} className={button.ghost}>I&rsquo;ve used Create before</button>}
            {step === STEP.permissions && <button type="button" onClick={() => setStep(nextStep(step))} className={button.ghost}>Skip for now</button>}
            {step === STEP.tryIt && <button type="button" onClick={() => setStep(nextStep(step))} className={button.ghost}>Skip this step</button>}
          </div>
          <button type="button" onClick={last ? () => finish(false) : () => setStep(nextStep(step))} className={`${button.primary} h-10 px-5`}>
            {last ? "Start creating" : welcome ? "Get started" : "Next"}
          </button>
        </div>
        <div className="flex gap-1.5" role="img" aria-label={`Step ${step + 1} of ${STEP_COUNT}`}>
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span key={i} className="relative size-1.5 rounded-full bg-line">
              {i === step && (
                <motion.span
                  layoutId="onb-dot"
                  className="absolute inset-0 rounded-full bg-ink"
                  style={{ borderRadius: 9999 }}
                  transition={t(spring.snappy)}
                />
              )}
            </span>
          ))}
        </div>
        <span className="sr-only" role="status" aria-live="polite">Step {step + 1} of {STEP_COUNT}</span>
      </footer>
    </motion.div>
  );
}

/** Mounts the flow when it should show. */
export function OnboardingGate({ show }: { show: boolean }) {
  const replay = useOnboarding((s) => s.replay);
  const dismissed = useOnboarding((s) => s.dismissed);
  // `show` covers first run and ?onboarding=1; replay reopens it from the avatar menu.
  const open = (show && !dismissed) || replay;
  if (typeof document === "undefined") return null;
  // Portaled to body so no ancestor stacking context or overflow clips it.
  return createPortal(<AnimatePresence>{open && <Onboarding key="onboarding" />}</AnimatePresence>, document.body);
}
