import { ArrowLeft, AudioWaveform, Loader2, PanelRight, Plus, Sparkles } from "lucide-react";

type Props = {
  /** A generation request is in flight ("Make it", "Add selection", or a narration build). */
  busy: boolean;
  /** Narrate is recording. Shown as the active tool; it does not spin "Make it". */
  narrating: boolean;
  hasSelection: boolean;
  previewOpen: boolean;
  onBack: () => void;
  onNarrate: () => void;
  onMakeIt: () => void;
  onAddSelection: () => void;
  onTogglePreview: () => void;
};

const ghost =
  "inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function CanvasToolbar({
  busy,
  narrating,
  hasSelection,
  previewOpen,
  onBack,
  onNarrate,
  onMakeIt,
  onAddSelection,
  onTogglePreview,
}: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Canvas studio"
      className="pointer-events-auto flex min-w-0 max-w-full items-center gap-1 rounded-xl border border-line bg-surface p-2 text-ink shadow-soft"
    >
      <button type="button" className={ghost} onClick={onBack} aria-label="Back" title="Back">
        <ArrowLeft size={16} strokeWidth={1.75} />
        <span className="@max-[760px]:sr-only">Back</span>
      </button>
      <span className="hidden px-2 text-sm font-medium text-ink-2 @[900px]:inline">Canvas</span>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <button
        type="button"
        className={`${ghost} ${narrating ? "border border-line bg-tray text-ink" : ""}`}
        onClick={(e) => {
          e.currentTarget.blur();
          onNarrate();
        }}
        disabled={busy}
        aria-label="Narrate"
        aria-pressed={narrating}
        title="Narrate over this canvas"
      >
        <AudioWaveform size={16} strokeWidth={1.75} />
        <span className="@max-[760px]:sr-only">Narrate</span>
      </button>
      <button
        type="button"
        className={ghost}
        onClick={onAddSelection}
        disabled={busy || narrating || !hasSelection}
        aria-label="Add selection"
        title="Generate only the selected shapes and add them to the page"
      >
        <Plus size={16} strokeWidth={1.75} />
        <span className="@max-[760px]:sr-only">Add selection</span>
      </button>
      <button
        type="button"
        onClick={onMakeIt}
        disabled={busy || narrating}
        aria-label="Make it"
        title="Make it"
        aria-busy={busy || undefined}
        className={`inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          busy ? "cursor-progress bg-accent text-white dark:text-[#0d0d0d]" : narrating ? "cursor-not-allowed bg-hover text-ink-3" : "bg-accent text-white dark:text-[#0d0d0d] hover:bg-accent/90"
        }`}
      >
        {busy ? <Loader2 size={16} strokeWidth={1.75} className="animate-spin" /> : <Sparkles size={16} strokeWidth={1.75} />}
        <span className="@max-[760px]:sr-only">Make it</span>
      </button>
      <button
        type="button"
        className={`${ghost} ${previewOpen ? "border border-line bg-tray text-ink" : ""}`}
        onClick={onTogglePreview}
        aria-label="Preview"
        aria-pressed={previewOpen}
        title={previewOpen ? "Hide preview" : "Show preview"}
      >
        <PanelRight size={16} strokeWidth={1.75} />
        <span className="@max-[760px]:sr-only">Preview</span>
      </button>
    </div>
  );
}
