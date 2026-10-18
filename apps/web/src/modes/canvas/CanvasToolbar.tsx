import { button, ICON, STROKE, surface } from "../../ui/styles";
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

const ghost = `${button.ghost} shrink-0 gap-2 px-2 disabled:text-ink-3 disabled:opacity-100`;

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
      aria-label="Sketch"
      className={`pointer-events-auto flex min-w-0 max-w-full items-center gap-1 ${surface.card} p-2 text-ink`}
    >
      <button type="button" className={ghost} onClick={onBack} aria-label="Back" title="Back">
        <ArrowLeft size={ICON.md} strokeWidth={STROKE} />
        <span className="@max-[760px]:sr-only">Back</span>
      </button>
      <span className="hidden px-2 text-[14px] text-ink-2 @[900px]:inline">Canvas</span>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <button
        type="button"
        className={`${ghost} ${narrating ? "bg-hover text-ink" : ""}`}
        onClick={(e) => {
          e.currentTarget.blur();
          onNarrate();
        }}
        disabled={busy}
        aria-label="Narrate"
        aria-pressed={narrating}
        title="Narrate over this canvas"
      >
        <AudioWaveform size={ICON.md} strokeWidth={STROKE} />
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
        <Plus size={ICON.md} strokeWidth={STROKE} />
        <span className="@max-[760px]:sr-only">Add selection</span>
      </button>
      <button
        type="button"
        onClick={onMakeIt}
        disabled={busy || narrating}
        aria-label="Make it"
        title="Make it"
        aria-busy={busy || undefined}
        className={`${button.primary} shrink-0 gap-2 ${busy ? "cursor-progress" : narrating ? "cursor-not-allowed" : ""}`}
      >
        {busy ? <Loader2 size={ICON.md} strokeWidth={STROKE} className="animate-spin" /> : <Sparkles size={ICON.md} strokeWidth={STROKE} />}
        <span className="@max-[760px]:sr-only">Make it</span>
      </button>
      <button
        type="button"
        className={`${ghost} ${previewOpen ? "bg-hover text-ink" : ""}`}
        onClick={onTogglePreview}
        aria-label="Preview"
        aria-pressed={previewOpen}
        title={previewOpen ? "Hide preview" : "Show preview"}
      >
        <PanelRight size={ICON.md} strokeWidth={STROKE} />
        <span className="@max-[760px]:sr-only">Preview</span>
      </button>
    </div>
  );
}
