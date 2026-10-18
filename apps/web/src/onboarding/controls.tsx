import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Minus, TriangleAlert } from "lucide-react";
import { chip, focusRing, ICON, segmented, STROKE } from "../ui/styles";
import type { PermState } from "./steps";

type Option<T extends string> = { id: T; label: string };

/** Arrow keys move selection inside a radio group; only the selected radio is a tab stop. */
function useRoving<T extends string>(options: Option<T>[], value: T, onChange: (v: T) => void) {
  const root = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    const i = options.findIndex((o) => o.id === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.id);
    requestAnimationFrame(() => root.current?.querySelectorAll<HTMLElement>('[role="radio"]')[options.indexOf(next)]?.focus());
  };
  return { root, onKeyDown };
}

/** Compact choice group: selected is bg-hover plus a check, one signal. */
export function ChoiceGroup<T extends string>({ label, labelId, options, value, onChange }: { label?: string; labelId?: string; options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  const { root, onKeyDown } = useRoving(options, value, onChange);
  return (
    <div ref={root} role="radiogroup" aria-label={label} aria-labelledby={labelId} onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const sel = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={sel}
            tabIndex={sel ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[14px] transition-colors duration-150 ${focusRing} ${sel ? "bg-hover text-ink" : "bg-tray text-ink-2 hover:bg-hover"}`}
          >
            {o.label}
            {sel && <Check size={ICON.md} strokeWidth={STROKE} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/** Pill segmented control with radio semantics (theme, start-in mode). */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: { label: string; options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  const { root, onKeyDown } = useRoving(options, value, onChange);
  return (
    <div ref={root} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={segmented.root}>
      {options.map((o) => {
        const sel = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={sel}
            tabIndex={sel ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={`inline-flex h-7 items-center rounded-full px-3 text-[14px] transition-colors duration-150 ${focusRing} ${sel ? "bg-surface text-ink shadow-soft" : "text-ink-2 hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function KeyCap({ children, pressed }: { children: ReactNode; pressed?: boolean }) {
  return (
    <kbd
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-line px-2 font-sans text-[14px] text-ink transition-[background-color,transform] duration-100 motion-reduce:transition-none ${
        pressed ? "translate-y-px bg-hover motion-reduce:translate-y-0" : "bg-surface"
      }`}
    >
      {children}
    </kbd>
  );
}

/** Status with a symbol and a word, never colour alone. */
export function StatusPill({ state }: { state: PermState }) {
  const p = ICON.sm;
  return (
    <span className={chip.status}>
      {state === "granted" ? (
        <><Check size={p} strokeWidth={STROKE} className="text-ok" aria-hidden="true" />Granted</>
      ) : state === "blocked" ? (
        <><TriangleAlert size={p} strokeWidth={STROKE} className="text-warn" aria-hidden="true" />Blocked</>
      ) : (
        <><Minus size={p} strokeWidth={STROKE} aria-hidden="true" />Not now</>
      )}
    </span>
  );
}

/** Live level bar. The fill is the one place besides focus where onboarding uses the accent. */
export function Meter({ value, label = "Microphone level" }: { value: number; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct / 10) * 10} className="h-1 w-40 overflow-hidden rounded-full bg-tray">
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Native select so keyboard and screen readers work for free. */
export function SelectField({ label, value, onChange, children, disabled }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="relative w-full max-w-72">
      <select
        id={id}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`h-8 w-full appearance-none rounded-lg border border-line bg-surface pl-3 pr-8 text-[14px] text-ink disabled:opacity-40 ${focusRing}`}
      >
        {children}
      </select>
      <ChevronDown size={12} strokeWidth={STROKE} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
    </div>
  );
}
