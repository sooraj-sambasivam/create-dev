import { AudioWaveform, Keyboard, Mic, PanelsTopLeft, type LucideIcon } from "lucide-react";
import { useScreenStore, type Mode } from "../../store/screenStore";

const MODES: { mode: Mode; label: string; icon: LucideIcon }[] = [
  { mode: "text", label: "Text", icon: Keyboard },
  { mode: "voice", label: "Voice", icon: Mic },
  { mode: "canvas", label: "Canvas", icon: PanelsTopLeft },
  { mode: "narrate", label: "Narrate", icon: AudioWaveform },
];

/**
 * Segmented control for the four input modes. No longer shown by the shell (decision F2: the
 * radial fan is the only mode entry); kept exported for API stability.
 */
export function ModeSwitch({ className = "" }: { className?: string }) {
  const mode = useScreenStore((s) => s.mode);
  const setMode = useScreenStore((s) => s.setMode);
  return (
    <div
      role="group"
      aria-label="Mode"
      data-testid="mode-switch"
      className={`inline-flex h-7 items-center gap-0.5 rounded-full bg-tray p-0.5 ${className}`}
    >
      {MODES.map(({ mode: m, label, icon: Icon }) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            data-testid={`mode-${m}`}
            onClick={() => setMode(m)}
            className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] leading-4 focus-visible:outline-2 focus-visible:outline-accent ${
              active ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"
            }`}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
