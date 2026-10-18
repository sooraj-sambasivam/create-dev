import { useEffect, useRef, useState } from "react";
import { AlertCircle, Crosshair, RotateCw, Sparkles } from "lucide-react";
import { selectedLabel } from "../composer/selection";
import { useScreenStore } from "../../store/screenStore";
import { useRightPanel } from "../rightPanel";
import { deriveItems, type ThreadItem } from "./items";

function useElapsed(active: boolean): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) return;
    setS(0);
    const t0 = Date.now();
    const id = window.setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return s;
}

function Avatar() {
  return (
    <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-tray text-ink-2">
      <Sparkles size={14} strokeWidth={1.75} />
    </span>
  );
}

function Building({ label }: { label: string }) {
  const elapsed = useElapsed(true);
  return (
    <div className="flex items-start gap-3" role="status" aria-live="polite">
      <Avatar />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[16px] text-ink-2">
          {label} <span className="tabular-nums text-ink-2">{elapsed}s</span>
        </div>
        <div className="shimmer-light mt-2 h-2 w-48 max-w-full rounded-full" />
      </div>
    </div>
  );
}

function Item({ item, hasPage, elementLabel }: { item: ThreadItem; hasPage: boolean; elementLabel: string | null }) {
  const generate = useScreenStore((s) => s.generate);
  const openTab = useRightPanel((s) => s.openTab);
  if (item.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-3xl bg-tray px-4 py-2.5 text-[16px] leading-6 text-ink">{item.text}</div>
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <div className="flex items-start gap-3">
        <Avatar />
        <div className="min-w-0 flex-1">
          {item.element && (
            <span className="mb-1 mr-2 inline-flex h-5 max-w-full items-center gap-1 rounded-md bg-tray px-1.5 text-[12px] text-ink-2">
              <Crosshair size={12} strokeWidth={1.75} aria-hidden />
              <span className="truncate">{elementLabel ?? "Element"}</span>
            </span>
          )}
          <p className="whitespace-pre-wrap break-words text-[16px] leading-6 text-ink">{item.text}</p>
          {hasPage && (
            <button
              type="button"
              onClick={() => openTab("output")}
              className="mt-1 rounded-md text-[14px] text-ink-2 transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              View page
            </button>
          )}
        </div>
      </div>
    );
  }
  if (item.kind === "building") return <Building label={item.label} />;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <AlertCircle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-bad" aria-hidden />
      <p className="min-w-0 flex-1 text-[14px] leading-5 text-ink">{item.message}</p>
      {item.retryPrompt && (
        <button
          type="button"
          onClick={() => void generate(item.retryPrompt!)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[14px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <RotateCw size={16} strokeWidth={1.75} aria-hidden />
          Retry
        </button>
      )}
    </div>
  );
}

/** The conversation for the main card: chat thread only, never the generated page. */
export function Thread() {
  const history = useScreenStore((s) => s.history);
  const status = useScreenStore((s) => s.status);
  const error = useScreenStore((s) => s.error);
  const hasPage = useScreenStore((s) => s.screen !== null);
  const items = deriveItems({ history, status, error });
  const selLabel = useScreenStore(selectedLabel);
  // Only the newest element edit can be tied to the current selection.
  const lastElementKey = [...items].reverse().find((i) => i.kind === "assistant" && i.element)?.key;
  const endRef = useRef<HTMLDivElement>(null);
  const lastKey = items.length ? items[items.length - 1].key : "";

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView?.({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [lastKey, items.length]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="thread">
      <div role="log" aria-label="Conversation" className="mx-auto flex w-full max-w-[740px] flex-col gap-6 px-4 py-6">
        {items.map((item) => (
          <Item key={item.key} item={item} hasPage={hasPage} elementLabel={item.key === lastElementKey ? selLabel : null} />
        ))}
        <div ref={endRef} aria-hidden />
      </div>
    </div>
  );
}
