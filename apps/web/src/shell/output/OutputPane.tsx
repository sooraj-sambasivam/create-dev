import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, Download, Link2, X } from "lucide-react";
import type { Screen } from "@create/shared";
import { ScreenRenderer } from "../../components/ScreenRenderer";
import { exportSite, downloadFile } from "../../lib/exportSite";
import { useScreenStore } from "../../store/screenStore";
import { BackendMap } from "./BackendMap";
import { sharePrototype } from "./shareApi";
import { PreviewFrame } from "./PreviewFrame";
import { ResizeHandle } from "./ResizeHandle";
import { useOutputLayout } from "./outputLayout";

export type RunLogEntry = { id: string; at: string; kind: string; detail: string };
export type OutputTab = "output" | "backend";

export interface OutputPaneProps {
  open: boolean;
  onClose: () => void;
  /** workspaceStore.runLog. */
  runLog?: RunLogEntry[];
  /** Defaults to the current screen in useScreenStore. */
  screen?: Screen | null;
}

const PREVIEW_W = 1200;
const PREVIEW_H = 340;

/** Read-only page preview scaled to the pane width. */
function ScaledPreview({ screen }: { screen: Screen }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / PREVIEW_W) || 0.4);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-xl border border-line bg-surface" style={{ height: PREVIEW_H * scale + 0 }} aria-label="Page preview" role="img">
      <div className="pointer-events-none absolute left-0 top-0 origin-top-left select-none" style={{ width: PREVIEW_W, transform: `scale(${scale})` }}>
        <PreviewFrame title="Page preview" width={PREVIEW_W} height={PREVIEW_H}>
          <ScreenRenderer screen={screen} editable={false} />
        </PreviewFrame>
      </div>
    </div>
  );
}

export function OutputPane({ open, onClose, runLog = [], screen: screenProp }: OutputPaneProps) {
  const storeScreen = useScreenStore((s) => s.screen);
  const history = useScreenStore((s) => s.history);
  const screen = screenProp ?? storeScreen;
  const [tab, setTab] = useState<OutputTab>("output");
  const [busy, setBusy] = useState<"publish" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const width = useOutputLayout((s) => s.width);

  const paneRef = useRef<HTMLElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashCopied = () => {
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  // Take focus on open, hand it back on close.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    paneRef.current?.focus({ preventScroll: true });
    return () => {
      if (prev && prev.isConnected) prev.focus({ preventScroll: true });
    };
  }, [open]);

  // Escape closes only when focus is inside the pane and no inner menu already handled it.
  const onPaneKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.stopPropagation();
      onClose();
    }
  };

  const publish = async () => {
    setBusy("publish");
    setError(null);
    try {
      const { filename, html } = await exportSite();
      downloadFile(filename, html);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(null);
    }
  };

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

  const iconBtn = "grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-tray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const action = "flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[14px] text-ink hover:bg-tray disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  if (!open) return null;

  return (
    <aside
      ref={paneRef}
      tabIndex={-1}
      onKeyDown={onPaneKeyDown}
      role="complementary"
      aria-label="Output"
      style={{ width }}
      className="relative flex h-full min-w-0 shrink-0 flex-col border-l border-line bg-surface outline-none"
    >
      <ResizeHandle />
          <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
            <h2 className="min-w-0 flex-1 truncate text-[14px] text-ink">{screen?.title || "Output"}</h2>
            <div role="tablist" aria-label="Pane view" className="flex rounded-full bg-tray p-0.5">
              {(["output", "backend"] as OutputTab[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1 text-[14px] transition-colors duration-150 ${tab === t ? "bg-surface text-ink shadow-soft" : "text-ink-2"}`}
                >
                  {t === "output" ? "Output" : "Backend"}
                </button>
              ))}
            </div>
            <button aria-label="Close" title="Close" onClick={onClose} className={iconBtn}>
              <X size={18} strokeWidth={1.75} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "backend" ? (
              <BackendMap />
            ) : (
              <div className="flex flex-col gap-4 p-4">
                {screen ? (
                  <>
                    <ScaledPreview screen={screen} />
                    <p className="-mt-2 text-[12px] text-ink-2">Made with Create</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={publish} disabled={busy !== null} className={action}>
                        <Download size={18} strokeWidth={1.75} />
                        {busy === "publish" ? "Preparing…" : "Publish HTML"}
                      </button>
                      <button onClick={share} disabled={busy !== null} className={action}>
                        {copied ? <Check size={18} strokeWidth={1.75} /> : <Link2 size={18} strokeWidth={1.75} />}
                        {busy === "share" ? "Saving…" : copied ? "Copied" : "Copy share link"}
                      </button>
                    </div>
                    {shareUrl && (
                      <div className="flex items-center gap-2 rounded-md bg-tray px-3 py-2">
                        <a href={shareUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
                          {shareUrl}
                        </a>
                        <button
                          aria-label="Copy link"
                          title="Copy link"
                          className={iconBtn}
                          onClick={() => navigator.clipboard?.writeText(shareUrl).then(flashCopied, () => {})}
                        >
                          <Copy size={18} strokeWidth={1.75} />
                        </button>
                      </div>
                    )}
                    {error && <p role="alert" className="text-[14px] text-bad">✕ {error}</p>}
                  </>
                ) : (
                  <p className="py-10 text-center text-[14px] text-ink-2">Nothing generated yet. Describe a page to get started.</p>
                )}

                <section aria-label="Run log" className="flex flex-col gap-1">
                  <h3 className="text-[12px] text-ink-2">Run log</h3>
                  {runLog.length === 0 ? (
                    <p className="text-[12px] text-ink-2">No runs yet.</p>
                  ) : (
                    <ul className="flex flex-col">
                      {runLog.map((l) => (
                        <li key={l.id} className="flex gap-2 border-b border-line py-1.5 text-[12px] last:border-b-0">
                          <time className="shrink-0 font-mono text-ink-2">{l.at}</time>
                          <span className="shrink-0 rounded-md bg-tray px-1.5 text-ink-2">{l.kind}</span>
                          <span className="min-w-0 break-words text-ink">{l.detail}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section aria-label="History" className="flex flex-col gap-1">
                  <h3 className="text-[12px] text-ink-2">History</h3>
                  {history.length === 0 ? (
                    <p className="text-[12px] text-ink-2">No edits yet.</p>
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
                </section>
              </div>
            )}
          </div>
    </aside>
  );
}
