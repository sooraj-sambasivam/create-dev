import { CircleAlert, Check, LoaderCircle, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DemoChunk, NarrationSession } from "@create/shared";
import { useScreenStore } from "../../../store/screenStore";
import { generateDemo, type DemoOutcome } from "./demoApi";
import { formatElapsed, progressPct } from "./demoFormat";
import { getDemoWorkspaceBridge } from "./workspaceBridge";

export type GeneratingDemoProps = {
  session: NarrationSession;
  /** Called after "Open page" (mode switches to text) or "Open in Output". */
  onDone(opened?: "page" | "output"): void;
  onClose(): void;
};

type Step = { label: string; pct: number };
type Status = "running" | "done" | "error";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function GeneratingDemo({ session, onDone, onClose }: GeneratingDemoProps) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>("running");
  const [steps, setSteps] = useState<Step[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DemoOutcome | null>(null);

  // The request runs on mount and on Retry only, so read the latest session from a ref.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const controller = new AbortController();
    setStatus("running");
    setSteps([]);
    setError(null);
    setOutcome(null);

    const onChunk = (chunk: DemoChunk) => {
      if (controller.signal.aborted) return;
      if (chunk.type === "step") {
        setSteps((prev) => [...prev, { label: chunk.label, pct: chunk.pct }]);
      }
    };

    const { screen } = useScreenStore.getState();
    generateDemo(sessionRef.current, screen, onChunk, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        useScreenStore.getState().setScreen(result.screen, result.summary);
        getDemoWorkspaceBridge().logDemo({
          sessionId: sessionRef.current.id,
          title: "Demo",
          summary: result.summary,
          mock: result.mock,
        });
        setOutcome(result);
        setStatus("done");
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error && e.message ? e.message : "Something went wrong");
        setStatus("error");
      });

    return () => controller.abort();
  }, [attempt]);

  // Elapsed timer runs only while the demo is being built.
  useEffect(() => {
    if (status !== "running") return;
    const started = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [status, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  const openPage = () => {
    onDone("page");
  };

  const openInOutput = () => {
    const workspace = getDemoWorkspaceBridge();
    if (!workspace.isOutputOpen()) workspace.toggleOutput();
    onDone("output");
  };

  const pct = progressPct(steps, status === "done");

  if (status === "done" && outcome) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-shell p-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="generating-demo-title"
          className="relative w-full max-w-[520px] rounded-xl border border-line bg-surface p-7"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-tray ${focusRing}`}
          >
            <X size={18} strokeWidth={1.75} />
          </button>

          <h1
            id="generating-demo-title"
            className="pr-8 text-[28px] leading-9 font-normal tracking-[-0.01em] text-ink"
          >
            Your demo is ready
          </h1>
          <p className="mt-2 text-sm text-ink-2">{outcome.summary}</p>
          {outcome.mock ? (
            <p className="mt-2 text-xs text-ink-2">Built without a model key (mock mode)</p>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={openInOutput}
              className={`h-8 rounded-lg px-3 text-sm text-ink-2 transition-colors duration-150 hover:bg-tray ${focusRing}`}
            >
              Open in Output
            </button>
            <button
              type="button"
              onClick={openPage}
              className={`h-8 rounded-full bg-accent px-4 text-sm text-white transition-colors duration-150 hover:opacity-90 ${focusRing}`}
            >
              Open page
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-shell p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="generating-demo-title"
        aria-busy={status === "running"}
        className="relative w-full max-w-[520px] rounded-xl border border-line bg-surface p-7"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-tray ${focusRing}`}
        >
          <X size={18} strokeWidth={1.75} />
        </button>

        <h1
          id="generating-demo-title"
          className="pr-8 text-[28px] leading-9 font-normal tracking-[-0.01em] text-ink"
        >
          Building your demo
        </h1>
        <p className="mt-1 text-sm text-ink-2">This takes about 2 minutes</p>

        <div
          role="progressbar"
          aria-label="Demo progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-tray"
        >
          <div
            className={`h-full rounded-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none ${
              status === "running" ? "animate-pulse motion-reduce:animate-none" : ""
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-ink-2">
          <span>{status === "error" ? "Stopped" : "Working"}</span>
          <span className="tabular-nums">{formatElapsed(elapsed)}</span>
        </div>

        <ol className="mt-5 flex flex-col gap-3" aria-live="polite">
          {steps.map((step, i) => {
            const isCurrent = i === steps.length - 1 && status === "running";
            return (
              <li key={`${i}-${step.label}`} className="flex items-start gap-3 text-sm text-ink-2">
                {isCurrent ? (
                  <LoaderCircle
                    size={16}
                    strokeWidth={1.75}
                    className="mt-0.5 shrink-0 animate-spin text-ink-2 motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Check size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
                )}
                <span className={isCurrent ? "text-ink" : undefined}>{step.label}</span>
              </li>
            );
          })}
          {status === "running" && steps.length === 0 ? (
            <li className="flex items-start gap-3 text-sm text-ink-2">
              <LoaderCircle
                size={16}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0 animate-spin text-ink-2 motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span>Starting</span>
            </li>
          ) : null}
        </ol>

        {status === "error" ? (
          <div className="mt-6 flex flex-col gap-3 rounded-lg bg-tray p-4">
            <p className="flex items-start gap-2 text-sm text-ink">
              <CircleAlert size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-bad" aria-hidden="true" />
              <span>{error ?? "Something went wrong while building the demo."}</span>
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={retry}
                className={`flex h-8 items-center gap-2 rounded-full bg-accent px-4 text-sm text-white transition-colors duration-150 hover:opacity-90 ${focusRing}`}
              >
                <RotateCw size={16} strokeWidth={1.75} aria-hidden="true" />
                Retry
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default GeneratingDemo;
