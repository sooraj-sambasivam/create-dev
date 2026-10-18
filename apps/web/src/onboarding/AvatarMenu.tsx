import { useEffect, useRef, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useProfile } from "./profile";
import { useOnboarding } from "./onboardingStore";
import { setupSummary } from "./steps";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** The SS avatar with a small menu: replay onboarding and a read-only summary of the user's setup. */
export function AvatarMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const { intent, level } = useProfile();
  const replay = useOnboarding((s) => s.open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          btn.current?.focus();
        }
      }}
    >
      <button
        ref={btn}
        type="button"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-[12px] font-medium text-ink-2 transition-colors duration-150 hover:bg-hover ${focusRing}`}
      >
        {initials}
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-soft">
          <div role="menuitem" aria-disabled="true" tabIndex={-1} className="flex h-8 items-center gap-2 rounded-lg px-2 text-[14px] text-ink-2">
            <SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">Your setup: {setupSummary(intent, level)}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => {
              setOpen(false);
              replay();
            }}
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[14px] text-ink transition-colors duration-150 hover:bg-tray focus-visible:bg-tray focus-visible:outline-none"
          >
            <RotateCcw size={18} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
            Replay onboarding
          </button>
        </div>
      )}
    </div>
  );
}
