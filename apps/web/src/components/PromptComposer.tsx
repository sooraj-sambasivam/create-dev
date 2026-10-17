import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "motion/react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Slot before the textarea, e.g. a mic button. */
  leading?: ReactNode;
  /** Small helper line under the box. */
  hint?: ReactNode;
  autoFocus?: boolean;
}

export function PromptComposer({ value, onChange, onSubmit, disabled, placeholder, leading, hint, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = () => {
    if (disabled || !value.trim()) return;
    onSubmit(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <motion.div layout className="w-full">
      <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-neutral-900/80 p-2 shadow-xl shadow-black/30 backdrop-blur focus-within:border-indigo-400/50">
        {leading}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          rows={1}
          placeholder={placeholder ?? "Describe the screen you want…"}
          className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2.5 text-base text-neutral-100 outline-none placeholder:text-neutral-500"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        </button>
      </div>
      {hint && <div className="mt-2 px-2 text-xs text-neutral-400">{hint}</div>}
    </motion.div>
  );
}
