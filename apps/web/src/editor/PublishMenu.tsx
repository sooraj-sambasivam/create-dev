import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { downloadFile, exportSite } from "../lib/exportSite";

/** "Publish": download the site as one file, with plain steps to put it online for free. */
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
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
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
        className="rounded-md bg-emerald-500/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-400"
      >
        Publish
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 top-8 z-50 w-80 rounded-xl border border-white/10 bg-neutral-900 p-4 text-sm text-neutral-300 shadow-2xl"
          >
            <p className="font-medium text-white">Put your website online</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-neutral-400">
              <li>Download your website as one file.</li>
              <li>
                Open{" "}
                <a href="https://app.netlify.com/drop" target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline">
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
              className="mt-3 w-full rounded-lg bg-emerald-500 py-2 text-sm font-medium text-white hover:bg-emerald-400 disabled:opacity-60"
            >
              {busy ? "Preparing your file…" : "Download website"}
            </button>
            {done && !error && <p className="mt-2 text-xs text-emerald-300">Saved “{done}” to your Downloads folder.</p>}
            {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
            <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
              Forms on the page are for show only; they don't send messages yet. Phone, email and map links work.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
