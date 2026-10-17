import { useScreenStore, type Mode } from "../store/screenStore";

const MODES: { id: Mode; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "voice", label: "Voice" },
  { id: "canvas", label: "Canvas" },
  { id: "narrate", label: "Narrate" },
];

export function ModeSwitcher() {
  const mode = useScreenStore((s) => s.mode);
  const setMode = useScreenStore((s) => s.setMode);
  return (
    <div role="tablist" aria-label="Input mode" className="flex items-center gap-0.5 rounded-full bg-tray p-0.5">
      {MODES.map((m) => {
        const active = m.id === mode;
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={active}
            onClick={() => setMode(m.id)}
            className={`rounded-full px-3 py-1 text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              active ? "bg-surface text-ink shadow-soft" : "text-ink-2 hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
