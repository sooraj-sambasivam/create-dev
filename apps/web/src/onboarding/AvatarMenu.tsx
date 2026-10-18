import { useEffect, useRef, useState } from "react";
import { RotateCcw, Settings } from "lucide-react";
import { useOnboarding } from "./onboardingStore";
import { SettingsPanel } from "../settings";
import { focusRing, ICON, menuItem, STROKE, surface } from "../ui/styles";

/** The avatar with a small menu: Settings and Replay onboarding. */
export function AvatarMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const replay = useOnboarding((s) => s.open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const closeSettings = () => {
    setSettings(false);
    btn.current?.focus();
  };

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
        className={`grid size-8 place-items-center rounded-full border border-line bg-surface text-[12px] font-medium text-ink-2 transition-colors duration-150 hover:bg-hover ${focusRing}`}
      >
        {initials}
      </button>
      {open && (
        <div role="menu" aria-label="Account" className={`${surface.menu} absolute bottom-full left-0 z-50 mb-2 w-64`}>
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => {
              setOpen(false);
              setSettings(true);
            }}
            className={menuItem}
          >
            <Settings size={ICON.lg} strokeWidth={STROKE} className="text-ink-2" aria-hidden="true" />
            Settings
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              replay();
            }}
            className={menuItem}
          >
            <RotateCcw size={ICON.lg} strokeWidth={STROKE} className="text-ink-2" aria-hidden="true" />
            Replay onboarding
          </button>
        </div>
      )}
      {settings && <SettingsPanel onClose={closeSettings} />}
    </div>
  );
}
