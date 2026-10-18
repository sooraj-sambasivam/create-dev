import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, Code2, Crosshair, RotateCw, Sparkles } from "lucide-react";
import { findNode } from "@create/shared";
import { revealNode, useScreenStore } from "../../store/screenStore";
import { useWorkMode } from "../../store/modeStore";
import { useRightPanel } from "../rightPanel";
import { deriveItems, type ThreadItem } from "./items";
import { parseBlocks, type Inline } from "./markdown";
import { ICON, STROKE, button, chip, focusRing } from "../../ui/styles";
import { fadeUp, listStagger, useReducedMotionSafe } from "../../ui/motion";

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
      <Sparkles size={ICON.sm} strokeWidth={STROKE} />
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
          <span aria-hidden className="caret ml-1 inline-block h-4 w-0.5 translate-y-0.5 rounded-full bg-ink-3" />
        </div>
        <div className="shimmer-light mt-2 h-2 w-48 max-w-full rounded-full" />
      </div>
    </div>
  );
}

function Inlines({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((n, i) =>
        n.t === "bold" ? (
          <strong key={i} className="font-semibold">{n.v}</strong>
        ) : n.t === "code" ? (
          <code key={i} className="rounded-md bg-tray px-1 py-0.5 font-mono text-[14px]">{n.v}</code>
        ) : (
          <span key={i}>{n.v}</span>
        ),
      )}
    </>
  );
}

/** Answer text as React nodes (no HTML is ever injected). */
function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 break-words text-[16px] leading-6 text-ink">
      {parseBlocks(text).map((b, i) =>
        b.t === "p" ? (
          <p key={i}><Inlines inlines={b.inlines} /></p>
        ) : (
          (() => {
            const List = b.t;
            return (
              <List key={i} className={`flex flex-col gap-1 pl-5 ${b.t === "ul" ? "list-disc" : "list-decimal"}`}>
                {b.items.map((it, j) => (
                  <li key={j}><Inlines inlines={it} /></li>
                ))}
              </List>
            );
          })()
        ),
      )}
    </div>
  );
}

function ElementChip({ label, onClick }: { label: string; onClick: (() => void) | null }) {
  const cls = `${chip.tag} mb-1 mr-2`;
  const body = (
    <>
      <Crosshair size={ICON.sm} strokeWidth={STROKE} aria-hidden />
      <span className="truncate">{label}</span>
    </>
  );
  if (!onClick) return <span className={cls}>{body}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show ${label} on the page`}
      className={`${cls} transition-colors duration-120 hover:bg-hover hover:text-ink ${focusRing}`}
    >
      {body}
    </button>
  );
}

function Item({ item, hasPage }: { item: ThreadItem; hasPage: boolean }) {
  const generate = useScreenStore((s) => s.generate);
  const openTab = useRightPanel((s) => s.openTab);
  const setMode = useWorkMode((s) => s.setMode);
  const select = useScreenStore((s) => s.select);
  const exists = useScreenStore((s) => (item.kind === "assistant" || item.kind === "answer") && item.nodeId && s.screen ? Boolean(findNode(s.screen, item.nodeId)) : false);
  const focusElement = (id: string) => {
    openTab("output");
    select(id);
    revealNode(id);
  };
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
<ElementChip label={item.label ?? "Element"} onClick={exists && item.nodeId ? () => focusElement(item.nodeId!) : null} />
          )}
          <p className="whitespace-pre-wrap break-words text-[16px] leading-6 text-ink">{item.text}</p>
          {hasPage && (
            <button
              type="button"
              onClick={() => openTab("output")}
              className={`${button.ghost} mt-1 !px-2`}
            >
              View page
            </button>
          )}
        </div>
      </div>
    );
  }
  if (item.kind === "answer") {
    return (
      <div className="flex items-start gap-3" data-testid="answer">
        <Avatar />
        <div className="min-w-0 flex-1">
          {item.label && <ElementChip label={item.label} onClick={exists && item.nodeId ? () => focusElement(item.nodeId!) : null} />}
          <Markdown text={item.text} />
          {item.routed && <p className="mt-1 text-[12px] text-ink-3">Answered. No changes made.</p>}
          {item.suggestCode && (
            <button
              type="button"
              onClick={() => setMode("code")}
              className={`${button.secondary} mt-2`}
            >
              <Code2 size={ICON.md} strokeWidth={STROKE} aria-hidden />
              Switch to Code
            </button>
          )}
        </div>
      </div>
    );
  }
  if (item.kind === "building") return <Building label={item.label} />;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <AlertCircle size={ICON.lg} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-bad" aria-hidden />
      <p className="min-w-0 flex-1 text-[14px] leading-5 text-ink">{item.message}</p>
      {item.retryPrompt && (
        <button
          type="button"
          onClick={() => void generate(item.retryPrompt!)}
          className={`${button.ghost} shrink-0`}
        >
          <RotateCw size={ICON.md} strokeWidth={STROKE} aria-hidden />
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
  const asking = useScreenStore((s) => s.asking);
  const lastAttempt = useScreenStore((s) => s.lastAttempt);
  const hasPage = useScreenStore((s) => s.screen !== null);
  const items = deriveItems({ history, status, error, asking, lastAttempt });
  const endRef = useRef<HTMLDivElement>(null);
  const lastKey = items.length ? items[items.length - 1].key : "";
  const { v } = useReducedMotionSafe();

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView?.({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [lastKey, items.length]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="thread">
      <motion.div
        role="log"
        aria-label="Conversation"
        variants={v(listStagger)}
        initial="hidden"
        animate="show"
        className="mx-auto flex w-full max-w-[740px] flex-col gap-6 px-4 py-6"
      >
        {items.map((item) => (
          <motion.div key={item.key} variants={v(fadeUp)}>
            <Item item={item} hasPage={hasPage} />
          </motion.div>
        ))}
        <div ref={endRef} aria-hidden />
      </motion.div>
    </div>
  );
}
