import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Crosshair, Hammer, Layers, MessageCircleQuestion, Mic, X } from "lucide-react";
import { useProfile, type ProfileIntent, type ProfileLevel } from "./profile";
import { useWorkMode } from "../store/modeStore";
import { useOnboarding } from "./onboardingStore";
import {
  INTENT_OPTIONS,
  LEVEL_OPTIONS,
  HEADING_SIZES,
  STEP_COUNT,
  defaultModeFor,
  growHeading,
  isLastStep,
  nextStep,
  pointingHint,
  prevStep,
  requestMic,
  sampleReply,
  type MicResult,
  type StepIndex,
} from "./steps";

const ICON = { size: 18, strokeWidth: 1.75 } as const;
const ease = [0.22, 1, 0.36, 1] as const;
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const ghost = `h-8 rounded-lg px-3 text-[14px] text-ink-2 transition-colors duration-150 hover:bg-hover ${focusRing}`;
const primary = `h-8 rounded-lg bg-ink px-3 text-[14px] text-surface transition-colors duration-150 hover:opacity-90 ${focusRing}`;

const INTENT_ICON: Record<ProfileIntent, ReactNode> = {
  build: <Hammer {...ICON} />,
  ask: <MessageCircleQuestion {...ICON} />,
  both: <Layers {...ICON} />,
};

/** Selectable card used by steps 1 and 2. */
function Choice({ selected, onSelect, icon, label, hint }: { selected: boolean; onSelect: () => void; icon?: ReactNode; label: string; hint: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-150 ${focusRing} ${
        selected ? "border-accent bg-tray" : "border-line bg-surface hover:bg-tray"
      }`}
    >
      {icon && <span className="mt-0.5 text-ink-2">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-ink">{label}</span>
        <span className="block text-[12px] text-ink-2">{hint}</span>
      </span>
      {selected && <Check size={16} strokeWidth={1.75} className="mt-0.5 text-ink" aria-hidden="true" />}
    </button>
  );
}

/** Same look as the live pointer chip. */
function Chip({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute -top-7 left-0 z-10 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 text-[12px] leading-6 text-ink shadow-soft">
      <Crosshair size={12} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** Sample page for the pointing step. Static markup carrying data-node-id like the real renderer; hover shows the chip. */
function SamplePage({ size, answer, reduce }: { size: number; answer: string | null; reduce: boolean | null }) {
  const [hover, setHover] = useState<"heading" | "rating" | null>(null);
  const hoverCls = "relative w-fit rounded-md px-1 transition-colors duration-150 hover:bg-hover";
  return (
    <div data-screen-root className="rounded-xl border border-line bg-tray p-4">
      <div className={hoverCls} onPointerEnter={() => setHover("heading")} onPointerLeave={() => setHover(null)}>
        {hover === "heading" && <Chip label="Heading · Corner Coffee" />}
        <h3 data-node-id="onb-heading" style={{ fontSize: size, transition: reduce ? "none" : "font-size 150ms" }} className="font-medium leading-tight text-ink">
          Corner Coffee
        </h3>
      </div>
      <p data-node-id="onb-rating" className={`${hoverCls} mt-1 text-[14px] text-ink-2`} onPointerEnter={() => setHover("rating")} onPointerLeave={() => setHover(null)}>
        {hover === "rating" && <Chip label="Rating · 4.9" />}
        <span className="text-ink">4.9</span> from 212 reviews
      </p>
      <div>
        <span data-node-id="onb-button" className="mt-3 inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[14px] text-surface">
          Order now
        </span>
      </div>
      {answer && (
        <div role="status" className="mt-3 w-full rounded-xl border border-line bg-surface p-2.5 text-[12px] leading-5 text-ink shadow-soft">
          {answer}
        </div>
      )}
    </div>
  );
}

function TryPointing({ onDone, done }: { onDone: () => void; done: boolean }) {
  const reduce = useReducedMotion();
  const [sizeIdx, setSizeIdx] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const mode = useWorkMode((s) => s.mode);
  const [mic, setMic] = useState<MicResult | "idle" | "asking">("idle");
  const [typed, setTyped] = useState("");

  const askMic = async () => {
    setMic("asking");
    const r = await requestMic();
    setMic(r);
    if (r === "granted") onDone();
  };

  return (
    <div className="flex flex-col gap-3">
      <SamplePage size={HEADING_SIZES[sizeIdx]} answer={answer} reduce={reduce} />
      <p className="text-[14px] text-ink-2">{pointingHint(mode)}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={askMic}
          disabled={mic === "asking"}
          aria-label="Allow microphone"
          title="Allow microphone"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition-colors duration-150 hover:bg-hover disabled:opacity-60 ${focusRing}`}
        >
          <Mic size={16} strokeWidth={1.75} />
        </button>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !typed.trim()) return;
            const r = sampleReply(typed);
            if (r?.kind === "answer") setAnswer(r.text);
            else if (r?.kind === "bigger") { setAnswer(null); setSizeIdx(growHeading); }
            onDone();
          }}
          aria-label="Type instead"
          placeholder="Or type it here"
          className={`h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-3 ${focusRing}`}
        />
      </div>
      <p role="status" className="min-h-5 text-[12px] text-ink-2">
        {done && (
          <span className="inline-flex items-center gap-1 text-ok">
            <Check size={14} strokeWidth={1.75} aria-hidden="true" /> Got it. You're ready.
          </span>
        )}
        {!done && (mic === "denied" || mic === "unsupported") && "No problem — you can type instead."}
      </p>
    </div>
  );
}

const TITLES = ["What brings you here?", "How comfortable are you with code?", "Try pointing"];

export function Onboarding() {
  const profile = useProfile();
  const setMode = useWorkMode((s) => s.setMode);
  const close = useOnboarding((s) => s.close);
  const reduce = useReducedMotion();
  const [step, setStep] = useState<StepIndex>(0);
  const [intent, setIntent] = useState<ProfileIntent>(profile.intent);
  const [level, setLevel] = useState<ProfileLevel>(profile.level);
  const [tried, setTried] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Apply as soon as a choice is made so Skip keeps what was picked; the default mode follows intent.
  const pickIntent = (i: ProfileIntent) => {
    setIntent(i);
    profile.set({ intent: i });
    setMode(defaultModeFor(i));
  };
  const pickLevel = (l: ProfileLevel) => {
    setLevel(l);
    profile.set({ level: l });
  };
  const finish = () => {
    profile.set({ onboarded: true });
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

  // Lock page scroll while the card is open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      finish();
    } else if (e.key === "Tab") {
      const f = cardRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex=\"-1\"])");
      if (!f?.length) { e.preventDefault(); return; }
      const first = f[0];
      const last = f[f.length - 1];
      const inside = cardRef.current?.contains(document.activeElement) ?? false;
      if (e.shiftKey && (document.activeElement === first || !inside || document.activeElement === cardRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const last = isLastStep(step);
  return (
    <motion.div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 px-4 backdrop-blur-sm dark:bg-black/60"
      onKeyDown={onKeyDown}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.2, ease }}
    >
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onb-title"
        tabIndex={-1}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, y: 8 }}
        transition={{ duration: reduce ? 0 : 0.2, ease }}
        className="w-full max-w-[460px] rounded-xl border border-line bg-surface p-5 shadow-soft outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-1.5" role="img" aria-label={`Step ${step + 1} of ${STEP_COUNT}`}>
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-ink" : "bg-line"}`} />
            ))}
          </div>
          <button type="button" onClick={finish} aria-label="Skip onboarding" title="Skip" className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover ${focusRing}`}>
            <X {...ICON} />
          </button>
        </div>
        <h2 id="onb-title" className="mb-3 text-[16px] font-medium text-ink">{TITLES[step]}</h2>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.15, ease }}
          >
            {step === 0 && (
              <div role="radiogroup" aria-labelledby="onb-title" className="flex flex-col gap-2">
                {INTENT_OPTIONS.map((o) => (
                  <Choice key={o.id} selected={intent === o.id} onSelect={() => pickIntent(o.id)} icon={INTENT_ICON[o.id]} label={o.label} hint={o.hint} />
                ))}
              </div>
            )}
            {step === 1 && (
              <div role="radiogroup" aria-labelledby="onb-title" className="flex flex-col gap-2">
                {LEVEL_OPTIONS.map((o) => (
                  <Choice key={o.id} selected={level === o.id} onSelect={() => pickLevel(o.id)} label={o.label} hint={o.hint} />
                ))}
              </div>
            )}
            {step === 2 && <TryPointing done={tried} onDone={() => setTried(true)} />}
          </motion.div>
        </AnimatePresence>
        <div className="mt-5 flex items-center justify-between">
          <button type="button" onClick={finish} className={ghost}>Skip</button>
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep(prevStep(step))} className={ghost}>Back</button>
            )}
            <button type="button" onClick={last ? finish : () => setStep(nextStep(step))} className={primary}>
              {last ? "Start creating" : "Next"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Mounts the card when it should show. */
export function OnboardingGate({ show }: { show: boolean }) {
  const replay = useOnboarding((s) => s.replay);
  const dismissed = useOnboarding((s) => s.dismissed);
  // `show` covers first run and ?onboarding=1; replay reopens it from the avatar menu.
  const open = (show && !dismissed) || replay;
  if (typeof document === "undefined") return null;
  // Portaled to body so no ancestor stacking context or overflow clips the scrim.
  return createPortal(<AnimatePresence>{open && <Onboarding key="onboarding" />}</AnimatePresence>, document.body);
}
