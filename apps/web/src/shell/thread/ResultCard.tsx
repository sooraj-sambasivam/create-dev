import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AppWindow, ChevronDown, ExternalLink, LayoutTemplate, PenLine, Redo2, Undo2, type LucideIcon } from "lucide-react";
import { useScreenStore } from "../../store/screenStore";
import { applyPendingChange, discardPendingChange } from "../composer/staging";
import { useRightPanel } from "../rightPanel";
import { ICON, STROKE, button, focusRing, surface, text } from "../../ui/styles";
import { duration, ease, fadeUp, listStagger, spring, useReducedMotionSafe } from "../../ui/motion";
import type { ResultData, ResultRow } from "./runs";

/** Rows shown before "Show N more". */
export const VISIBLE_ROWS = 3;

function RowItem({ row }: { row: ResultRow }) {
  const { v } = useReducedMotionSafe();
  return (
    <motion.li variants={v(fadeUp)} className="flex h-8 items-center gap-3 px-3">
      <span className={`${text.ui} min-w-0 flex-1 truncate`}>{row.label}</span>
      {row.stat && <span className="max-w-[40%] shrink-0 truncate text-[12px] tabular-nums text-ink-3">{row.stat}</span>}
    </motion.li>
  );
}

function Rows({ rows }: { rows: ResultRow[] }) {
  const [all, setAll] = useState(false);
  const { reduce, v, t } = useReducedMotionSafe();
  const first = rows.slice(0, VISIBLE_ROWS);
  const rest = rows.slice(VISIBLE_ROWS);
  if (!rows.length) return null;
  return (
    <div className="border-t border-line">
      <motion.ul variants={v(listStagger)} className="flex flex-col py-1">
        {first.map((r, i) => (
          <RowItem key={`${i}-${r.label}`} row={r} />
        ))}
      </motion.ul>
      <AnimatePresence initial={false}>
        {all && rest.length > 0 && (
          <motion.ul
            key="rest"
            variants={v(listStagger)}
            initial="hidden"
            animate="show"
            exit={reduce ? { opacity: 0 } : { opacity: 0, clipPath: "inset(0 0 100% 0)" }}
            transition={t({ duration: duration.base, ease: ease.standard })}
            className="flex flex-col pb-1"
          >
            {rest.map((r, i) => (
              <RowItem key={`${i + VISIBLE_ROWS}-${r.label}`} row={r} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      {rest.length > 0 && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll((a) => !a)}
          className={`flex h-8 w-full items-center gap-1 border-t border-line px-3 text-[12px] text-ink-3 transition-colors duration-120 hover:text-ink ${focusRing}`}
        >
          {all ? "Show fewer" : `Show ${rest.length} more`}
          <ChevronDown size={ICON.sm} strokeWidth={STROKE} aria-hidden className={`transition-transform duration-200 ${all ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}

function Frame({ icon: Icon, title, meta, actions, children, testId, label }: { icon: LucideIcon; title: string; meta: ReactNode; actions: ReactNode; children?: ReactNode; testId?: string; label?: string }) {
  const { reduce, v, t } = useReducedMotionSafe();
  return (
    <motion.div
      layout={reduce ? false : "position"}
      transition={t(spring.gentle)}
      variants={v(listStagger)}
      role="group"
      aria-label={label ?? title}
      data-testid={testId ?? "result-card"}
      className={`${surface.card} overflow-hidden`}
    >
      <div className="flex items-center gap-3 p-3">
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tray text-ink-2">
          <Icon size={ICON.lg} strokeWidth={STROKE} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`${text.ui} truncate font-medium`}>{title}</p>
          <p className="truncate text-[12px] leading-4 text-ink-3">{meta}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
      {children}
    </motion.div>
  );
}

function iconFor(title: string, action: "page" | "app"): LucideIcon {
  if (action === "app") return AppWindow;
  return title.startsWith("Edited") ? PenLine : LayoutTemplate;
}

/** One card per action: what was built, edited or lifted, with Undo and View page / Open app. */
export function ResultCard({ result, action, url, undoable }: { result: ResultData; action: "page" | "app"; url: string | null; undoable: boolean }) {
  const openTab = useRightPanel((s) => s.openTab);
  const busy = useScreenStore((s) => s.status === "loading");
  const [undone, setUndone] = useState(false);
  const toggleUndo = () => {
    const st = useScreenStore.getState();
    if (undone) st.redo();
    else st.undo();
    setUndone(!undone);
  };
  return (
    <Frame
      icon={iconFor(result.title, action)}
      title={result.title}
      meta={result.meta}
      actions={
        <>
          {undoable && (
            <button type="button" onClick={toggleUndo} disabled={busy} className={button.ghost}>
              {undone ? <Redo2 size={ICON.md} strokeWidth={STROKE} aria-hidden /> : <Undo2 size={ICON.md} strokeWidth={STROKE} aria-hidden />}
              {undone ? "Redo" : "Undo"}
            </button>
          )}
          {action === "app" && url ? (
            <a href={url} target="_blank" rel="noreferrer" className={button.secondary}>
              Open app
              <ExternalLink size={ICON.sm} strokeWidth={STROKE} aria-hidden />
            </a>
          ) : (
            <button type="button" onClick={() => openTab("output")} className={button.secondary}>
              View page
            </button>
          )}
        </>
      }
    >
      <Rows rows={result.rows} />
    </Frame>
  );
}

/** A staged change waiting for review: the same card, with Apply and Discard. */
export function ReviewResultCard({ label, summary, staging }: { label: string; summary: string; staging: boolean }) {
  if (staging) {
    return (
      <div role="status" data-testid="review-card" className={`${surface.card} p-3`}>
        <p className={text.ui}>Preparing a change to review…</p>
        <div aria-hidden className="shimmer-light mt-2 h-2 w-40 max-w-full rounded-full" />
      </div>
    );
  }
  return (
    <Frame
      testId="review-card"
      label="Review change"
      icon={PenLine}
      title={`Review change · ${label}`}
      meta={summary}
      actions={
        <>
          <button type="button" data-testid="review-discard" className={button.secondary} onClick={discardPendingChange}>Discard</button>
          <button type="button" data-testid="review-apply" className={button.primary} onClick={applyPendingChange}>Apply</button>
        </>
      }
    />
  );
}
