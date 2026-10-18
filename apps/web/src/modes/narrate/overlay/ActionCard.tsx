import { useEffect, useState } from "react";
import { Bookmark, Lightbulb, Rocket, Wand2 } from "lucide-react";
import { ICON, STROKE } from "../../../ui/styles";
import { ACTIONS, actionAt, moveSelection, type PointerAction } from "./pointerActions";

const ICONS: Record<PointerAction, typeof Lightbulb> = { understand: Lightbulb, transform: Wand2, app: Rocket, keep: Bookmark };

/**
 * The label chip, opened in place: what the pointer can do with the pinned thing.
 * Up/Down choose, Enter runs the highlighted action (the keys are taken in the capture phase, so Enter does
 * not also finish the narration), Esc lets go. It is a real list of buttons, so a click works too.
 */
export function ActionCard({ label, onAction }: { label: string; onAction(action: PointerAction): void }) {
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSel((s) => moveSelection(s, e.key as "ArrowDown" | "ArrowUp"));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onAction(actionAt(sel).id);
      }
      // Esc is left alone: NarrateOverlay's handler unpins first, which closes this card.
    };
    window.addEventListener("keydown", kd, true);
    return () => window.removeEventListener("keydown", kd, true);
  }, [sel, onAction]);

  return (
    <div role="group" aria-label={`What should I do with ${label}?`} data-testid="pointer-action-card" className="pointer-events-auto w-[272px] p-1.5">
      <p className="truncate px-2 pb-1 pt-0.5 text-[12px] leading-4 text-ink-3">{label}</p>
      <ul className="flex flex-col gap-0.5">
        {ACTIONS.map((a, i) => {
          const Icon = ICONS[a.id];
          const on = i === sel;
          return (
            <li key={a.id}>
              <button
                type="button"
                aria-current={on}
                onMouseEnter={() => setSel(i)}
                onClick={() => onAction(a.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-accent ${on ? "bg-selected" : "hover:bg-hover"}`}
              >
                <Icon size={ICON.md} strokeWidth={STROKE} className={on ? "shrink-0 text-accent" : "shrink-0 text-ink-2"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] leading-5 text-ink">{a.title}</span>
                  <span className="block truncate text-[12px] leading-4 text-ink-2">{a.hint}</span>
                </span>
                {on && <kbd className="shrink-0 rounded border border-line bg-tray px-1.5 font-mono text-[12px] leading-5 text-ink-2">↵</kbd>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-2 pb-0.5 pt-1.5 text-[12px] leading-4 text-ink-3">
        <kbd className="font-mono">↑↓</kbd> choose · <kbd className="font-mono">↵</kbd> run · <kbd className="font-mono">esc</kbd> release
      </p>
    </div>
  );
}
