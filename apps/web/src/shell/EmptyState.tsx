import { AudioWaveform, Keyboard, Mic, PanelsTopLeft } from "lucide-react";
import { useScreenStore } from "../store/screenStore";

const EXAMPLES = [
  "A landing page for a coffee roastery",
  "A portfolio for a photographer",
  "A pricing page with three tiers",
];

const chip =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Empty-state helpers: example prompts, and a small row that opens each way of working. */
export function EmptyState() {
  const generate = useScreenStore((s) => s.generate);
  const setMode = useScreenStore((s) => s.setMode);
  return (
    <div className="mt-6 flex flex-col items-center gap-4" data-testid="empty-state">
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Example prompts">
        {EXAMPLES.map((p) => (
          <button key={p} type="button" className={chip} onClick={() => void generate(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-[12px] text-ink-2" role="group" aria-label="Ways to start">
        <button type="button" className={chip} onClick={() => window.dispatchEvent(new Event("create:focus-composer"))}>
          <Keyboard size={16} strokeWidth={1.75} aria-hidden />
          Type
        </button>
        <button type="button" className={chip} onClick={() => window.dispatchEvent(new Event("create:speak"))}>
          <Mic size={16} strokeWidth={1.75} aria-hidden />
          Speak
        </button>
        <button type="button" className={chip} onClick={() => setMode("canvas")}>
          <PanelsTopLeft size={16} strokeWidth={1.75} aria-hidden />
          Sketch
        </button>
        <button type="button" className={chip} onClick={() => setMode("narrate")}>
          <AudioWaveform size={16} strokeWidth={1.75} aria-hidden />
          Point
        </button>
      </div>
    </div>
  );
}
