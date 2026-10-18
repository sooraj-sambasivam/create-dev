import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RotateCcw, Undo2 } from "lucide-react";
import { useScreenStore } from "./store/screenStore";
import { ICON, STROKE, button, surface } from "./ui/styles";

interface Props {
  children: ReactNode;
  /** "app" shows a full fallback with reset and undo; "node" degrades one element in place. */
  scope?: "app" | "node";
  /** Changing this value clears a caught error (e.g. the node content changed). */
  resetKey?: unknown;
  /** Keeps `[data-node-id]` on the placeholder so pointing still resolves it. */
  nodeId?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.scope ?? "app"}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private reset = () => this.setState({ error: null });

  private undo = () => {
    try {
      useScreenStore.getState().undo();
    } catch {
      /* the store itself may be what failed; reset still works */
    }
    this.reset();
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.scope === "node") {
      return (
        <div role="alert" data-node-id={this.props.nodeId} className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-[12px] text-ink-2">
          <AlertCircle size={ICON.md} strokeWidth={STROKE} className="shrink-0 text-bad" aria-hidden />
          This element couldn't be shown.
        </div>
      );
    }
    return (
      <div role="alert" className="grid min-h-dvh place-items-center bg-shell px-4 text-ink">
        <div className={`${surface.card} flex w-full max-w-[420px] flex-col gap-4 p-4`}>
          <div className="flex items-start gap-3">
            <AlertCircle size={ICON.lg} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-bad" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-[16px] leading-6 text-ink">Something broke</h1>
              <p className="text-[14px] leading-5 text-ink-2">Your work is still saved. Try again, or undo the last change.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={this.reset} className={button.secondary}>
              <RotateCcw size={ICON.md} strokeWidth={STROKE} aria-hidden />
              Try again
            </button>
            <button type="button" onClick={this.undo} className={button.secondary}>
              <Undo2 size={ICON.md} strokeWidth={STROKE} aria-hidden />
              Undo last change
            </button>
          </div>
        </div>
      </div>
    );
  }
}
