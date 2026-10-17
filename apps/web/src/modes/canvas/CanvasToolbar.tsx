import { ArrowLeft, AudioWaveform, Loader2, PanelRight, Plus, Sparkles } from "lucide-react";

type Props = {
  busy: boolean;
  hasSelection: boolean;
  previewOpen: boolean;
  onBack: () => void;
  onNarrate: () => void;
  onMakeIt: () => void;
  onAddSelection: () => void;
  onTogglePreview: () => void;
};

const ghost =
  "inline-flex h-8 items-center gap-2 rounded-lg px-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function CanvasToolbar({ busy, hasSelection, previewOpen, onBack, onNarrate, onMakeIt, onAddSelection, onTogglePreview }: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Canvas studio"
      className="pointer-events-auto flex items-center gap-1 rounded-xl border border-line bg-surface p-2 text-ink shadow-soft"
    >
      <button type="button" className={ghost} onClick={onBack} aria-label="Back" title="Back">
        <ArrowLeft size={18} strokeWidth={1.75} />
        Back
      </button>
      <span className="px-2 text-sm">Canvas</span>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <button type="button" className={ghost} onClick={onNarrate} aria-label="Narrate" title="Narrate over this canvas">
        <AudioWaveform size={18} strokeWidth={1.75} />
        Narrate
      </button>
      <button
        type="button"
        className={ghost}
        onClick={onAddSelection}
        disabled={busy || !hasSelection}
        aria-label="Add selection"
        title="Generate only the selected shapes and add them to the page"
      >
        <Plus size={18} strokeWidth={1.75} />
        Add selection
      </button>
      <button
        type="button"
        onClick={onMakeIt}
        disabled={busy}
        aria-label="Make it"
        className="inline-flex h-8 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {busy ? <Loader2 size={18} strokeWidth={1.75} className="animate-spin" /> : <Sparkles size={18} strokeWidth={1.75} />}
        Make it
      </button>
      <button
        type="button"
        className={`${ghost} ${previewOpen ? "bg-hover text-ink" : ""}`}
        onClick={onTogglePreview}
        aria-label="Preview"
        aria-pressed={previewOpen}
        title={previewOpen ? "Hide preview" : "Show preview"}
      >
        <PanelRight size={18} strokeWidth={1.75} />
        Preview
      </button>
    </div>
  );
}
