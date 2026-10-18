import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RotateCcw, Undo2 } from "lucide-react";
import { useScreenStore } from "./store/screenStore";

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
          <AlertCircle size={14} strokeWidth={1.75} className="shrink-0 text-bad" aria-hidden />
          This element could not be shown.
        </div>
      );
    }
    const btn =
      "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
    return (
      <div role="alert" className="grid min-h-dvh place-items-center bg-shell px-4 text-ink">
        <div className="flex w-full max-w-[420px] flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-bad" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-[16px] leading-6">Something broke</h1>
              <p className="text-[14px] leading-5 text-ink-2">Your work is still saved. Try again, or undo the last change.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={this.reset} className={btn}>
              <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
              Try again
            </button>
            <button type="button" onClick={this.undo} className={btn}>
              <Undo2 size={16} strokeWidth={1.75} aria-hidden />
              Undo last change
            </button>
          </div>
        </div>
      </div>
    );
  }
}
