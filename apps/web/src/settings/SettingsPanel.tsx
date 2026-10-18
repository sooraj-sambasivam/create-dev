import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { fade, scaleIn, useReducedMotionSafe } from "../ui/motion";
import { RotateCcw, X } from "lucide-react";
import { useThemeStore, THEME_LABEL, THEME_ORDER } from "../shell/theme";
import { useProfile, type ProfileDefaultMode, type ProfileLevel } from "../onboarding/profile";
import { useMic } from "../onboarding/useMic";
import { MicBody } from "../onboarding/MicBody";
import { ChoiceGroup, KeyCap, SegmentedControl, StatusPill } from "../onboarding/controls";
import { LEVEL_OPTIONS, MODE_LABEL, isMacPlatform } from "../onboarding/steps";
import { useOnboarding } from "../onboarding/onboardingStore";
import { button, focusRing, ICON, STROKE, surface, text } from "../ui/styles";

const TEST_MS = 5000;
const THEME_OPTIONS = THEME_ORDER.map((id) => ({ id, label: THEME_LABEL[id] }));
const MODE_OPTIONS: { id: ProfileDefaultMode; label: string }[] = [
  { id: "chat", label: MODE_LABEL.chat },
  { id: "code", label: MODE_LABEL.code },
];

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] leading-4 text-ink-2">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="text-[14px] text-ink">{label}</span>
      {children}
    </div>
  );
}

/** Floating Settings window opened from the avatar menu. Changes apply immediately. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const profile = useProfile();
  const replay = useOnboarding((s) => s.open);
  const mic = useMic();
  const ref = useRef<HTMLDivElement>(null);
  const { v } = useReducedMotionSafe();
  const mac = typeof navigator === "undefined" ? true : isMacPlatform(navigator.platform);

  useEffect(() => { ref.current?.focus(); }, []);
  // A microphone test runs for a few seconds, then releases the device.
  useEffect(() => {
    if (!mic.live) return;
    const t = setTimeout(mic.stop, TEST_MS);
    return () => clearTimeout(t);
  }, [mic.live, mic.stop]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  // The wrapper centres the window so the window itself is free to animate transform.
  return createPortal(
    <motion.div
      variants={v(fade)}
      initial="hidden"
      animate="show"
      exit="exit"
      className="pointer-events-none fixed inset-0 z-[90] grid place-items-center p-4"
    >
    <motion.div
      ref={ref}
      role="dialog"
      aria-label="Settings"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      variants={v(scaleIn)}
      className={`${surface.card} pointer-events-auto flex max-h-full w-full max-w-[480px] flex-col overflow-hidden outline-none`}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line pl-5 pr-2">
        <h2 className={text.ui}>Settings</h2>
        <button type="button" aria-label="Close settings" className={button.icon} onClick={onClose}>
          <X size={ICON.lg} strokeWidth={STROKE} />
        </button>
      </div>
      <div className="overflow-y-auto">
        <Section title="Appearance">
          <Row label="Theme">
            <SegmentedControl label="Theme" options={THEME_OPTIONS} value={theme} onChange={setTheme} />
          </Row>
        </Section>
        <Section title="General">
          <Row label="Start in">
            <SegmentedControl label="Start in" options={MODE_OPTIONS} value={profile.defaultMode} onChange={(v) => profile.set({ defaultMode: v })} />
          </Row>
          <div className="flex flex-col gap-2">
            <span id="set-level" className="text-[14px] text-ink">Comfort with code</span>
            <ChoiceGroup<ProfileLevel> labelId="set-level" options={LEVEL_OPTIONS} value={profile.level} onChange={(v) => profile.set({ level: v })} />
          </div>
        </Section>
        <Section title="Microphone" aside={<StatusPill state={mic.status} />}>
          <MicBody mic={mic} onTest={() => void mic.start()} />
          <Row label="Talk key">
            <span className="inline-flex items-center gap-2 text-[14px] text-ink-2">
              Hold <KeyCap>{mac ? "⌥ Option" : "Alt"}</KeyCap>
            </span>
          </Row>
        </Section>
        <Section title="Onboarding">
          <div>
            <button
              type="button"
              className={`${button.secondary} ${focusRing}`}
              onClick={() => {
                onClose();
                replay();
              }}
            >
              <RotateCcw size={ICON.md} strokeWidth={STROKE} aria-hidden="true" />
              Replay onboarding
            </button>
          </div>
        </Section>
      </div>
    </motion.div>
    </motion.div>,
    document.body,
  );
}
