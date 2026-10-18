import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, Code2, Crosshair, RotateCw } from "lucide-react";
import { findNode } from "@create/shared";
import { revealNode, useScreenStore } from "../../store/screenStore";
import { useWorkMode } from "../../store/modeStore";
import { usePendingChange } from "../../store/composerPrefs";
import { useRightPanel } from "../rightPanel";
import { ContextCard } from "../context/ContextCard";
import { deriveItems, groupTurns, type ThreadItem } from "./items";
import { parseBlocks, type Inline } from "./markdown";
import { ActionRow } from "./ActionRow";
import { ResultCard, ReviewResultCard } from "./ResultCard";
import { LiveRunLine, RunLine } from "./RunLine";
import { UserBubble } from "./UserBubble";
import { useLiftLog } from "./liftLog";
import type { LiveRun } from "./runs";
import { ICON, STROKE, button, chip, focusRing } from "../../ui/styles";
import { fadeUp, listStagger, spring, useReducedMotionSafe } from "../../ui/motion";

/** Wide enough for the 740px column plus the 280px context card in the gutter, without overlap. */
const CARD_FITS_WIDTH = 1332;

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
  const cls = `${chip.tag} mr-2`;
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

function Item({ item }: { item: ThreadItem }) {
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
  switch (item.kind) {
    case "user":
      return <UserBubble text={item.text} />;
    case "run":
      return <RunLine run={item.run} ms={item.ms} steps={item.steps} />;
    case "building":
      return <LiveRunLine label={item.label} run={item.run} />;
    case "result":
      return <ResultCard result={item.result} action={item.action} url={item.url} undoable={item.undoable} />;
    case "review":
      return <ReviewResultCard label={item.label} summary={item.summary} staging={item.staging} />;
    case "actions":
      return <ActionRow text={item.text} retry={item.retry} latest={item.latest} />;
    case "assistant":
      return (
        <div className="min-w-0">
          {item.element && <div className="mb-1"><ElementChip label={item.label ?? "Element"} onClick={exists && item.nodeId ? () => focusElement(item.nodeId!) : null} /></div>}
          <p className="whitespace-pre-wrap break-words text-[16px] leading-6 text-ink">{item.text}</p>
        </div>
      );
    case "answer":
      return (
        <div className="min-w-0" data-testid="answer">
          {item.label && <div className="mb-1"><ElementChip label={item.label} onClick={exists && item.nodeId ? () => focusElement(item.nodeId!) : null} /></div>}
          <Markdown text={item.text} />
          {item.providerTag && <p className="mt-1 text-[12px] text-ink-3" data-testid="answer-provider">{item.providerTag}</p>}
          {item.routed && <p className="mt-1 text-[12px] text-ink-3">Answered. No changes made.</p>}
          {item.suggestCode && (
            <button type="button" onClick={() => setMode("code")} className={`${button.secondary} mt-2`}>
              <Code2 size={ICON.md} strokeWidth={STROKE} aria-hidden />
              Switch to Code
            </button>
          )}
        </div>
      );
    case "error":
      return (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
          <AlertCircle size={ICON.lg} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <p className="min-w-0 flex-1 text-[14px] leading-5 text-ink">{item.message}</p>
          {item.retryPrompt && (
            <button type="button" onClick={() => void generate(item.retryPrompt!)} className={`${button.ghost} shrink-0`}>
              <RotateCw size={ICON.md} strokeWidth={STROKE} aria-hidden />
              Retry
            </button>
          )}
        </div>
      );
  }
}

/** The conversation for the main card: chat thread only, never the generated page. */
export function Thread() {
  const history = useScreenStore((s) => s.history);
  const status = useScreenStore((s) => s.status);
  const error = useScreenStore((s) => s.error);
  const asking = useScreenStore((s) => s.asking);
  const lastAttempt = useScreenStore((s) => s.lastAttempt);
  const run = useScreenStore((s) => s.run);
  const canUndo = useScreenStore((s) => s.past.length > 0 && s.status !== "loading");
  const pending = usePendingChange((s) => s.pending);
  const staging = usePendingChange((s) => s.staging);
  const lifts = useLiftLog((s) => s.entries);
  const liftActive = useLiftLog((s) => s.active);
  const panelOpen = useRightPanel((s) => s.open);

  const liveRun: LiveRun | null = useMemo(
    () => (liftActive ? { kind: "lift", startedAt: liftActive.startedAt, steps: [{ label: "Reading the region", at: 0 }] } : run),
    [liftActive, run],
  );
  const items = deriveItems({
    history,
    status,
    error,
    asking,
    lastAttempt,
    run: liveRun,
    pending: pending ? { label: pending.label, summary: pending.summary } : null,
    staging,
    lifts,
    lifting: liftActive !== null,
    canUndo,
  });
  const turns = groupTurns(items);
  const endRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const lastKey = items.length ? items[items.length - 1].key : "";
  const { reduce, v, t } = useReducedMotionSafe();

  useEffect(() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView?.({ block: "end", behavior: prefersReduced ? "auto" : "smooth" });
  }, [lastKey, items.length]);

  // The context card floats in the gutter when the card is wide enough, else it folds into a pill.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setWide(el.clientWidth >= CARD_FITS_WIDTH);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="relative flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,#000_24px)]"
        data-testid="thread"
      >
        <motion.div
          role="log"
          aria-label="Conversation"
          variants={v(listStagger)}
          initial="hidden"
          animate="show"
          className="mx-auto flex w-full max-w-[772px] flex-col gap-8 px-4 pb-6 pt-8"
        >
          {turns.map((tn) => (
            <motion.section
              key={`turn-${tn.turn}`}
              variants={v(listStagger)}
              layout={reduce ? false : "position"}
              transition={t(spring.gentle)}
              className="group/turn flex flex-col gap-3"
            >
              {tn.items.map((item) => (
                <motion.div key={item.key} variants={v(fadeUp)} layout={reduce ? false : "position"} transition={t(spring.gentle)}>
                  <Item item={item} />
                </motion.div>
              ))}
            </motion.section>
          ))}
          <div ref={endRef} aria-hidden />
        </motion.div>
      </div>
      {!panelOpen && items.length > 0 && <ContextCard wide={wide} />}
    </div>
  );
}
