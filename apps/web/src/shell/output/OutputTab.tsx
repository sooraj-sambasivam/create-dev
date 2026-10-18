import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, CircleAlert, Copy, Link2 } from "lucide-react";
import type { Screen } from "@create/shared";
import { ScreenCanvas } from "../../components/ScreenCanvas";
import { useScreenStore } from "../../store/screenStore";
import { shareAndCopy } from "./shareApi";
import { ShowQrButton } from "../../share/QrCard";
import { AnimatePresence, motion } from "motion/react";
import { ICON, STROKE, button } from "../../ui/styles";
import { duration, spring, useReducedMotionSafe } from "../../ui/motion";

export interface OutputTabProps {
  /** Defaults to the current screen in useScreenStore. */
  screen?: Screen | null;
}

/**
 * Output tab body: the live page (Abel's ScreenCanvas, editable in place with Edit/Preview, Add,
 * undo, Publish and the AI box), then a footer with the share link and the edit
 * history. It is the only renderer of the page, so [data-screen-root] stays unique. Renders inside
 * the right panel.
 */
export function OutputTab({ screen: screenProp }: OutputTabProps) {
  const storeScreen = useScreenStore((s) => s.screen);
  const history = useScreenStore((s) => s.history);
  const screen = screenProp ?? storeScreen;
  const [busy, setBusy] = useState<"share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashCopied = () => {
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const share = async () => {
    if (!screen) return;
    setBusy("share");
    setError(null);
    try {
      const { url, copied: ok } = await shareAndCopy(screen);
      setShareUrl(url);
      if (ok) flashCopied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a share link.");
    } finally {
      setBusy(null);
    }
  };

  const { reduce } = useReducedMotionSafe();
  const iconBtn = button.iconSm;
  const action = button.secondary;

  const status = useScreenStore((st) => st.status);
  const generating = status === "loading";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {screen || generating ? (
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-2">
          <ScreenCanvas />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-[16px] text-ink">Your page will appear here</p>
          <p className="text-[14px] text-ink-2">Describe what to build in the chat. You can edit it right here.</p>
        </div>
      )}

      <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-line px-4 py-3">
        <div className="flex flex-col gap-3">
          {screen && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={share} disabled={busy !== null} className={action}>
                  <span className="relative grid size-4 place-items-center">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={copied ? "ok" : "link"}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                        transition={reduce ? { duration: duration.fast } : { ...spring.snappy, opacity: { duration: duration.fast } }}
                        className="grid place-items-center"
                      >
                        {copied ? <Check size={ICON.md} strokeWidth={STROKE} className="text-ok" /> : <Link2 size={ICON.md} strokeWidth={STROKE} />}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  {busy === "share" ? "Saving…" : copied ? "Copied" : "Copy link"}
                </button>
                {shareUrl && <ShowQrButton url={shareUrl} className={button.secondary} />}
                {shareUrl && (
                  <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-tray pl-3 pr-1">
                    <a href={shareUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
                      {shareUrl}
                    </a>
                    <button aria-label="Copy link" title="Copy link" className={iconBtn} onClick={() => navigator.clipboard?.writeText(shareUrl).then(flashCopied, () => {})}>
                      <Copy size={ICON.md} strokeWidth={STROKE} />
                    </button>
                  </div>
                )}
              </div>
              {error && (
                <p role="alert" className="flex items-center gap-1.5 text-[14px] text-bad">
                  <CircleAlert size={ICON.md} strokeWidth={STROKE} aria-hidden className="shrink-0" />
                  {error}
                </p>
              )}
            </>
          )}

          <details className="group" aria-label="History">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1 text-[14px] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
              <ChevronRight size={ICON.md} strokeWidth={STROKE} className="transition-transform duration-120 group-open:rotate-90" aria-hidden />
              History{history.length > 0 ? ` (${history.length})` : ""}
            </summary>
            {history.length === 0 ? (
              <p className="py-2 text-[12px] text-ink-2">No edits yet.</p>
            ) : (
              <ul className="flex flex-col">
                {[...history].reverse().map((h, i) => (
                  <li key={i} className="flex flex-col gap-0.5 border-b border-line py-1.5 text-[12px] last:border-b-0">
                    <span className="text-ink">{h.prompt}</span>
                    <span className="text-ink-2">{h.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>
      </div>
    </div>
  );
}
