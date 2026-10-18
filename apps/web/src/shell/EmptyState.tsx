import { AudioWaveform, Keyboard, Mic, PanelsTopLeft } from "lucide-react";
import { useScreenStore } from "../store/screenStore";
import { ICON, STROKE, chip } from "../ui/styles";

const EXAMPLES = [
  "A landing page for a coffee roastery",
  "A portfolio for a photographer",
  "A pricing page with three tiers",
];

/** Empty-state helpers: example prompts, and a small row that opens each way of working. */
export function EmptyState() {
  const generate = useScreenStore((s) => s.generate);
  const setMode = useScreenStore((s) => s.setMode);
  return (
    <div className="mt-6 flex flex-col items-center gap-4" data-testid="empty-state">
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Example prompts">
        {EXAMPLES.map((p) => (
          <button key={p} type="button" className={chip.action} onClick={() => void generate(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Ways to start">
        <button type="button" className={chip.action} onClick={() => window.dispatchEvent(new Event("create:focus-composer"))}>
          <Keyboard size={ICON.md} strokeWidth={STROKE} aria-hidden />
          Type
        </button>
        <button type="button" className={chip.action} onClick={() => window.dispatchEvent(new Event("create:speak"))}>
          <Mic size={ICON.md} strokeWidth={STROKE} aria-hidden />
          Speak
        </button>
        <button type="button" className={chip.action} onClick={() => setMode("canvas")}>
          <PanelsTopLeft size={ICON.md} strokeWidth={STROKE} aria-hidden />
          Sketch
        </button>
        <button type="button" className={chip.action} onClick={() => setMode("narrate")}>
          <AudioWaveform size={ICON.md} strokeWidth={STROKE} aria-hidden />
          Narrate
        </button>
      </div>
    </div>
  );
}
