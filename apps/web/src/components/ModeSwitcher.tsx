import { motion } from "motion/react";
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
    <div role="tablist" className="flex items-center gap-1 rounded-full border border-white/10 bg-neutral-900/70 p-1 backdrop-blur">
      {MODES.map((m) => {
        const active = m.id === mode;
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={active}
            onClick={() => setMode(m.id)}
            className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition ${active ? "text-white" : "text-neutral-400 hover:text-neutral-200"}`}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 rounded-full bg-indigo-500/80"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
