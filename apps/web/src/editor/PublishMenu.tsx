import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { downloadFile, exportSite } from "../lib/exportSite";
import { button, surface } from "../ui/styles";

/** "Export HTML": download the site as one file, with plain steps to put it online for free. */
export function PublishMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const { filename, html } = await exportSite();
      downloadFile(filename, html);
      setDone(filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${button.secondary} shrink-0`}
      >
        Export HTML
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Export HTML"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`${surface.card} absolute right-0 top-10 z-50 w-80 p-4 text-[14px] text-ink-2`}
          >
            <p className="font-medium text-ink">Export your page as HTML</p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[12px] leading-relaxed text-ink-2">
              <li>Download your page as one HTML file.</li>
              <li>
                Open{" "}
                <a href="https://app.netlify.com/drop" target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  Netlify Drop
                </a>{" "}
                (free) and drag the file onto the page.
              </li>
              <li>You get a web address to share right away. Make a free account there to keep it and add your own domain.</li>
            </ol>
            <button
              type="button"
              disabled={busy}
              onClick={download}
              className={`${button.primary} mt-4 w-full`}
            >
              {busy ? "Preparing your file…" : "Download HTML file"}
            </button>
            {done && !error && <p className="mt-3 text-[12px] text-ok">Saved “{done}” to your Downloads folder.</p>}
            {error && <p className="mt-3 text-[12px] text-bad">{error}</p>}
            <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
              Forms on the page are for show only; they don't send messages yet. Phone, email and map links work.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
