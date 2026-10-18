import { useEffect, useRef, useState } from "react";
import { LogOut, RotateCcw, Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useOnboarding } from "./onboardingStore";
import { SettingsPanel } from "../settings";
import { avatar, hairline, ICON, menuItem, STROKE, surface, text } from "../ui/styles";
import { UsageMeter, displayName, useAuth } from "../auth";
import { originFor, popover, useReducedMotionSafe } from "../ui/motion";

/** The avatar with a small menu: Settings and Replay onboarding. */
export function AvatarMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const replay = useOnboarding((s) => s.open);
  const { v } = useReducedMotionSafe();
  const user = useAuth((s) => s.user);
  const logOut = useAuth((s) => s.logOut);
  const refreshUsage = useAuth((s) => s.refreshUsage);

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
        onClick={() => {
          if (!open) void refreshUsage();
          setOpen((o) => !o);
        }}
        className={avatar}
      >
        {initials}
      </button>
      <AnimatePresence>
      {open && (
        <motion.div
          role="menu"
          aria-label="Account"
          variants={v(popover)}
          initial="hidden"
          animate="show"
          exit="exit"
          style={{ transformOrigin: originFor("up", "left") }}
          className={`${surface.menu} absolute bottom-full left-0 z-50 mb-2 w-64`}
        >
          {user && (
            <>
              <div className="flex flex-col gap-2 px-2 pb-1 pt-1.5">
                <div className="flex flex-col">
                  <span className={`${text.ui} truncate`}>{displayName(user)}</span>
                  {user.kind === "account" && user.email && user.name && <span className={`${text.meta} truncate`}>{user.email}</span>}
                  {user.kind === "guest" && <span className={text.meta}>Sign up for 3x daily usage</span>}
                </div>
                <UsageMeter compact />
              </div>
              <div className={hairline} role="separator" />
            </>
          )}
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
          {user && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logOut();
              }}
              className={menuItem}
            >
              <LogOut size={ICON.lg} strokeWidth={STROKE} className="text-ink-2" aria-hidden="true" />
              {user.kind === "guest" ? "Sign in or sign up" : "Sign out"}
            </button>
          )}
        </motion.div>
      )}
      </AnimatePresence>
      <AnimatePresence>{settings && <SettingsPanel onClose={closeSettings} />}</AnimatePresence>
    </div>
  );
}
