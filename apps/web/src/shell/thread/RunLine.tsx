import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { ICON, STROKE, focusRing } from "../../ui/styles";
import { duration, ease, spring, staggerDelay, useReducedMotionSafe } from "../../ui/motion";
import { RUN_VERB_ING, runLabel, type LiveRun, type RunKind, type StepRecord } from "./runs";

function useElapsedSince(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

function StepLog({ steps, live }: { steps: StepRecord[]; live: boolean }) {
  const { reduce } = useReducedMotionSafe();
  return (
    <ol className="flex flex-col gap-1.5 pb-1 pt-2" aria-label="Steps">
      {steps.map((s, i) => {
        const current = live && i === steps.length - 1;
        return (
          <motion.li
            key={`${i}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.emphasized, delay: live ? 0 : staggerDelay(i) } }}
            className="flex items-center gap-2 text-[14px] leading-5 text-ink-3"
          >
            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${current ? "caret bg-accent" : "bg-line"}`} />
            <span className={`min-w-0 flex-1 truncate ${current ? "text-ink-2" : ""}`}>{s.label}</span>
            <span className="shrink-0 text-[12px] tabular-nums">+{Math.round(s.at / 1000)}s</span>
          </motion.li>
        );
      })}
    </ol>
  );
}

function Shell({ label, steps, live, busyHint }: { label: React.ReactNode; steps: StepRecord[]; live: boolean; busyHint?: boolean }) {
  const [open, setOpen] = useState(false);
  const { reduce, t } = useReducedMotionSafe();
  const expandable = steps.length > 0;
  return (
    <motion.div layout={reduce ? false : "position"} transition={t(spring.gentle)} className="border-b border-line pb-2" data-testid={live ? "run-live" : "run-line"}>
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`group inline-flex h-6 items-center gap-1 rounded-md text-[14px] text-ink-3 transition-colors duration-120 hover:text-ink ${focusRing}`}
        >
          {label}
          <ChevronRight size={ICON.sm} strokeWidth={STROKE} aria-hidden className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        </button>
      ) : (
        <div className="inline-flex h-6 items-center text-[14px] text-ink-3">{label}</div>
      )}
      <AnimatePresence initial={false}>
        {open && expandable && (
          <motion.div
            key="log"
            initial={reduce ? { opacity: 0 } : { opacity: 0, clipPath: "inset(0 0 100% 0)" }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, clipPath: "inset(0 0 0% 0)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, clipPath: "inset(0 0 100% 0)" }}
            transition={t({ duration: duration.base, ease: ease.standard })}
          >
            <StepLog steps={steps} live={live} />
          </motion.div>
        )}
      </AnimatePresence>
      {busyHint && <div aria-hidden className="shimmer-light mt-2 h-2 w-48 max-w-full rounded-full" />}
    </motion.div>
  );
}

/** "Built in 12s ›": a finished run. A button that opens its step log. */
export function RunLine({ run, ms, steps }: { run: RunKind; ms: number; steps: StepRecord[] }) {
  return <Shell label={<span className="tabular-nums">{runLabel(run, ms)}</span>} steps={steps} live={false} />;
}

/** The run in flight: live timer, shimmer, and the steps so far. */
export function LiveRunLine({ label, run }: { label: string; run: LiveRun | null }) {
  const elapsed = useElapsedSince(run?.startedAt ?? null);
  const text = run ? `${RUN_VERB_ING[run.kind]}… ` : label;
  return (
    <div role="status" aria-live="polite">
      <Shell
        live
        busyHint
        steps={run?.steps ?? []}
        label={
          <>
            <span>{text}</span>
            {run && <span className="tabular-nums">{Math.floor(elapsed / 1000)}s</span>}
          </>
        }
      />
    </div>
  );
}
