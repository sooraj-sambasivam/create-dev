import { CircleAlert, Check, LoaderCircle, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DemoChunk, NarrationSession } from "@create/shared";
import { useScreenStore } from "../../../store/screenStore";
import { useCardRect } from "../../../narrate/useCardRect";
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

const FALLBACK_STEPS = [
  { at: 0, label: "Reading your narration", pct: 10 },
  { at: 3, label: "Matching what you pointed at", pct: 30 },
  { at: 7, label: "Laying out the page", pct: 55 },
  { at: 14, label: "Polishing the details", pct: 75 },
];

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const accentBtn = "bg-accent text-on-accent";
const sectionCls = "relative w-full max-w-[520px] rounded-xl border border-line bg-surface p-8";

function Frame({ children }: { children: React.ReactNode }) {
  const card = useCardRect();
  const style = card ? { left: card.left, top: card.top, width: card.width, height: card.height } : undefined;
  return (
    <div
      className={`fixed z-50 flex items-center justify-center overflow-auto bg-surface p-4 ${card ? "rounded-xl" : "inset-0"}`}
      style={style}
    >
      {children}
    </div>
  );
}

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

  // Real step events win; until the first one arrives, show timed placeholder steps
  // so the card never reads as frozen.
  const shownSteps: Step[] =
    steps.length > 0
      ? steps
      : FALLBACK_STEPS.filter((f) => elapsed >= f.at).map((f) => ({ label: f.label, pct: f.pct }));
  const pct = progressPct(shownSteps, status === "done");

  if (status === "done" && outcome) {
    return (
      <Frame>
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="generating-demo-title"
          className={sectionCls}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className={`absolute right-6 top-6 flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover ${focusRing}`}
          >
            <X size={18} strokeWidth={1.75} />
          </button>

          <h1
            id="generating-demo-title"
            className="pr-8 text-[28px] leading-9 font-normal tracking-[-0.01em] text-ink"
          >
            Your demo is ready
          </h1>
          <p className="mt-2 text-[14px] text-ink-2">{outcome.summary}</p>
          {outcome.mock ? (
            <p className="mt-2 text-[12px] text-ink-2">Built without a model key (mock mode)</p>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={openInOutput}
              className={`h-8 rounded-lg px-3 text-[14px] text-ink-2 transition-colors duration-150 hover:bg-hover ${focusRing}`}
            >
              Open in Output
            </button>
            <button
              type="button"
              onClick={openPage}
              className={`h-8 rounded-full ${accentBtn} px-4 text-[14px] transition-colors duration-150 hover:opacity-90 ${focusRing}`}
            >
              Open page
            </button>
          </div>
        </section>
      </Frame>
    );
  }

  return (
    <Frame>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="generating-demo-title"
        aria-busy={status === "running"}
        className={sectionCls}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className={`absolute right-6 top-6 flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover ${focusRing}`}
        >
          <X size={18} strokeWidth={1.75} />
        </button>

        <h1
          id="generating-demo-title"
          className="pr-8 text-[28px] leading-9 font-normal tracking-[-0.01em] text-ink"
        >
          Building your demo
        </h1>
        <p className="mt-1 text-[14px] text-ink-2">This only takes a moment</p>

        <div
          role="progressbar"
          aria-label="Demo progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-hover"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-[12px] text-ink-2">
          <span>{status === "error" ? "Stopped" : "Working"}</span>
          <span className="tabular-nums">{formatElapsed(elapsed)}</span>
        </div>

        <ol className="mt-5 flex flex-col gap-3" aria-live="polite">
          {shownSteps.map((step, i) => {
            const isCurrent = i === shownSteps.length - 1 && status === "running";
            return (
              <li key={`${i}-${step.label}`} className="flex items-start gap-3 text-[14px] text-ink-2">
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
          {status === "running" && shownSteps.length === 0 ? (
            <li className="flex items-start gap-3 text-[14px] text-ink-2">
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
            <p className="flex items-start gap-2 text-[14px] text-ink">
              <CircleAlert size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-bad" aria-hidden="true" />
              <span>{error ?? "Something went wrong while building the demo."}</span>
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={retry}
                className={`flex h-8 items-center gap-2 rounded-full ${accentBtn} px-4 text-[14px] transition-colors duration-150 hover:opacity-90 ${focusRing}`}
              >
                <RotateCw size={16} strokeWidth={1.75} aria-hidden="true" />
                Retry
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </Frame>
  );
}

export default GeneratingDemo;
