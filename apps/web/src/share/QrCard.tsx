import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, QrCode, X } from "lucide-react";
import { button, focusRing, ICON, STROKE, surface, text } from "../ui/styles";
import { qrSvg } from "./qr";
import { fade, scaleIn, useReducedMotionSafe } from "../ui/motion";

/** Modal card with a large QR for a share link, the URL and a copy button. Esc or the backdrop closes it. */
export function QrCard({ url, onClose }: { url: string; onClose: () => void }) {
  const svg = useMemo(() => qrSvg(url), [url]);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { v } = useReducedMotionSafe();

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = () =>
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );

  // Portaled to the body: the side panel animates with a transform, which would trap a fixed overlay.
  return createPortal(
    <motion.div
      data-narrate-ignore
      variants={v(fade)}
      initial="hidden"
      animate="show"
      exit="exit"
      className="fixed inset-0 z-[200] grid place-items-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Scan to open"
        variants={v(scaleIn)}
        className={`${surface.card} flex w-full max-w-[min(92vw,520px)] flex-col gap-4 p-5`}
      >
        <div className="flex items-center justify-between">
          <h2 className={text.title}>Scan to open</h2>
          <button ref={closeRef} type="button" aria-label="Close" title="Close" className={button.icon} onClick={onClose}>
            <X size={ICON.md} strokeWidth={STROKE} />
          </button>
        </div>
        {svg ? (
          <div
            // A QR must be dark modules on a light field in both themes, or phone scanners reject it.
            style={{ background: "#fff", color: "#000" }}
            className="mx-auto aspect-square w-full max-w-[min(80vw,440px)] rounded-lg p-3 [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="text-[14px] text-bad">This link is too long for a QR code.</p>
        )}
        <div className="flex h-8 items-center gap-2 rounded-lg bg-tray pl-3 pr-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={url}>
            {url}
          </span>
          <button type="button" aria-label="Copy link" title="Copy link" className={button.iconSm} onClick={copy}>
            {copied ? <Check size={ICON.md} strokeWidth={STROKE} className="text-ok" /> : <Copy size={ICON.md} strokeWidth={STROKE} />}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** "Show QR" action that opens the QR card for `url`. */
export function ShowQrButton({ url, className = button.secondary }: { url: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`${className} ${focusRing}`} onClick={() => setOpen(true)}>
        <QrCode size={ICON.md} strokeWidth={STROKE} aria-hidden />
        Show QR
      </button>
      <AnimatePresence>{open && <QrCard url={url} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
