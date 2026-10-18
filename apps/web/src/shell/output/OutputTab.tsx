import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, CircleAlert, Copy, Link2 } from "lucide-react";
import type { Screen } from "@create/shared";
import { ScreenCanvas } from "../../components/ScreenCanvas";
import { useScreenStore } from "../../store/screenStore";
import { sharePrototype } from "./shareApi";

export type RunLogEntry = { id: string; at: string; kind: string; detail: string };

export interface OutputTabProps {
  /** workspaceStore.runLog. */
  runLog?: RunLogEntry[];
  /** Defaults to the current screen in useScreenStore. */
  screen?: Screen | null;
}

/**
 * Output tab body: the live page (Abel's ScreenCanvas, editable in place with Edit/Preview, Add,
 * undo, Publish and the AI box), then a footer with the share link, the run log and the edit
 * history. It is the only renderer of the page, so [data-screen-root] stays unique. Renders inside
 * the right panel.
 */
export function OutputTab({ runLog = [], screen: screenProp }: OutputTabProps) {
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
      const { url } = await sharePrototype(screen);
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        flashCopied();
      } catch {
        /* clipboard blocked; the link is still shown */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a share link.");
    } finally {
      setBusy(null);
    }
  };

  const iconBtn = "grid size-6 place-items-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const action = "flex h-8 min-w-[136px] items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-[14px] text-ink transition-colors duration-150 hover:bg-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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
                  {copied ? <Check size={16} strokeWidth={1.75} className="text-ok" /> : <Link2 size={16} strokeWidth={1.75} />}
                  {busy === "share" ? "Saving…" : copied ? "Copied" : "Copy share link"}
                </button>
                {shareUrl && (
                  <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-tray pl-3 pr-1">
                    <a href={shareUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
                      {shareUrl}
                    </a>
                    <button aria-label="Copy link" title="Copy link" className={iconBtn} onClick={() => navigator.clipboard?.writeText(shareUrl).then(flashCopied, () => {})}>
                      <Copy size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                )}
              </div>
              {error && (
                <p role="alert" className="flex items-center gap-1.5 text-[14px] text-bad">
                  <CircleAlert size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
                  {error}
                </p>
              )}
            </>
          )}

          <details className="group" aria-label="Run log">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1 text-[14px] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
              <ChevronRight size={16} strokeWidth={1.75} className="transition-transform duration-150 group-open:rotate-90" aria-hidden />
              Run log{runLog.length > 0 ? ` (${runLog.length})` : ""}
            </summary>
            {runLog.length === 0 ? (
              <p className="py-2 text-[12px] text-ink-2">No runs yet.</p>
            ) : (
              <ul className="flex flex-col">
                {runLog.map((l) => (
                  <li key={l.id} className="flex gap-2 border-b border-line py-1.5 text-[12px] last:border-b-0">
                    <time className="shrink-0 font-mono text-ink-2" title={l.at}>{l.at.slice(11, 19)}</time>
                    <span className="shrink-0 self-start rounded-md bg-tray px-1.5 leading-5 text-ink-2">{l.kind}</span>
                    <span className="min-w-0 break-all text-ink">{l.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </details>

          <details className="group" aria-label="History">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1 text-[14px] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
              <ChevronRight size={16} strokeWidth={1.75} className="transition-transform duration-150 group-open:rotate-90" aria-hidden />
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
