import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Inbox, X } from "lucide-react";
import { TRAY_CHANGED } from "../../../narrate/snippetCapture";
import { deleteTrayItem, dragPayload, fetchSnippet, fetchTray, newestFirst, openTrayItem, type TrayCard } from "../../../narrate/trayApi";
import { fadeUp, popover, spring, useReducedMotionSafe } from "../../../ui/motion";
import { focusRing, ICON, STROKE } from "../../../ui/styles";

const POLL_MS = 3000;

/** The in-page tray: a pill that opens into a horizontal row of snippet cards (same cards as the notch tray). */
export function TrayPill(_props: { reduce?: boolean | null }) {
  const m = useReducedMotionSafe();
  const [items, setItems] = useState<TrayCard[]>([]);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<TrayCard | null>(null);
  const [bump, setBump] = useState(0);
  const prev = useRef(0);

  const refresh = useCallback(async () => {
    const list = await fetchTray();
    if (list) setItems(newestFirst(list));
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    const on = () => { setOpen(true); void refresh(); };
    window.addEventListener(TRAY_CHANGED, on);
    return () => { clearInterval(t); window.removeEventListener(TRAY_CHANGED, on); };
  }, [refresh]);

  useEffect(() => {
    if (items.length > prev.current) setBump((b) => b + 1);
    prev.current = items.length;
  }, [items.length]);

  if (!items.length) return null;
  const onOpen = async (c: TrayCard) => {
    const url = await openTrayItem(c);
    if (url) window.open(url, "_blank", "noopener");
  };
  const onDelete = async (c: TrayCard) => {
    setItems((l) => l.filter((x) => x.id !== c.id));
    if (!(await deleteTrayItem(c.id))) void refresh();
  };

  return (
    <div data-tray-ignore className="pointer-events-auto absolute bottom-[88px] left-14 z-[102] flex flex-col items-start gap-2" aria-label="Tray">
      <AnimatePresence>
        {open && (
          <motion.div
            key="row"
            variants={m.v(popover)}
            initial="hidden"
            animate="show"
            exit="exit"
            style={{ transformOrigin: "bottom left" }}
            className="relative max-w-[min(720px,calc(100vw-80px))] rounded-2xl border border-line bg-surface p-2 shadow-soft"
          >
            <AnimatePresence>
              {hover && (
                <motion.div
                  key={hover.id}
                  variants={m.v(fadeUp)}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="pointer-events-none absolute bottom-full left-0 mb-2 w-[300px] overflow-hidden rounded-xl border border-line bg-surface shadow-soft"
                >
                  {hover.thumbnailUrl ? (
                    <img src={hover.thumbnailUrl} alt="" className="block max-h-[220px] w-full bg-tray object-contain" />
                  ) : (
                    <div className="grid h-24 place-items-center bg-tray text-ink-3"><Inbox size={ICON.lg} strokeWidth={STROKE} /></div>
                  )}
                  <div className="px-3 py-2">
                    <div className="truncate text-[14px] text-ink">{hover.title}</div>
                    <div className="truncate text-[12px] text-ink-3">{sourceLabel(hover)}</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" role="list">
              <AnimatePresence initial={false} mode="popLayout">
                {items.map((c) => (
                  <Card key={c.id} card={c} onOpen={onOpen} onDelete={onDelete} onHover={setHover} />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        aria-expanded={open}
        aria-label={`Tray, ${items.length} saved`}
        onClick={() => setOpen((o) => !o)}
        key={bump}
        initial={m.reduce ? false : { scale: 0.94 }}
        animate={{ scale: 1 }}
        transition={m.t(spring.bouncy)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[14px] text-ink shadow-soft transition-colors duration-120 hover:bg-tray ${focusRing}`}
      >
        <Inbox size={ICON.md} strokeWidth={STROKE} />
        Tray
        <span className="rounded-full bg-tray px-1.5 text-[12px] leading-5 text-ink-2">{items.length}</span>
      </motion.button>
    </div>
  );
}

function sourceLabel(c: TrayCard): string {
  const host = (() => { try { return c.source?.url ? new URL(c.source.url).host : ""; } catch { return ""; } })();
  return [c.kind, c.source?.title || host].filter(Boolean).join(" · ");
}

function Card({ card, onOpen, onDelete, onHover }: { card: TrayCard; onOpen(c: TrayCard): void; onDelete(c: TrayCard): void; onHover(c: TrayCard | null): void }) {
  const m = useReducedMotionSafe();
  const html = useRef<string | null>(null);
  // Markup is fetched on hover so a drag can fill dataTransfer synchronously.
  const warm = () => {
    onHover(card);
    if (card.hasSnippet && html.current === null) {
      html.current = "";
      void fetchSnippet(card.id).then((s) => { html.current = s?.html ?? ""; });
    }
  };
  return (
    <motion.div
      layout={!m.reduce}
      role="listitem"
      variants={m.v(fadeUp)}
      initial="hidden"
      animate="show"
      exit="exit"
      transition={m.t(spring.gentle)}
      className="group relative w-[132px] shrink-0 snap-start"
      onMouseEnter={warm}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        draggable
        onClick={() => onOpen(card)}
        onDragStart={(e) => {
          const data = dragPayload(card, html.current || null);
          for (const [k, v] of Object.entries(data)) e.dataTransfer.setData(k, v);
          e.dataTransfer.effectAllowed = "copy";
          const img = e.currentTarget.querySelector("img");
          if (img) e.dataTransfer.setDragImage(img, 20, 20);
        }}
        className={`block w-full overflow-hidden rounded-xl border border-line bg-tray text-left transition-[border-color,transform] duration-120 hover:border-ink-3 active:scale-[0.98] ${focusRing}`}
        aria-label={`Open ${card.title}`}
      >
        <div className="grid h-[84px] place-items-center overflow-hidden bg-tray">
          {card.thumbnailUrl ? (
            <img src={card.thumbnailUrl} alt="" draggable={false} className="h-full w-full object-cover object-top" />
          ) : (
            <Inbox size={ICON.lg} strokeWidth={STROKE} className="text-ink-3" />
          )}
        </div>
        <div className="truncate px-2 py-1.5 text-[12px] leading-4 text-ink">{card.title}</div>
      </button>
      <button
        type="button"
        aria-label={`Remove ${card.title}`}
        onClick={() => onDelete(card)}
        className={`absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-surface/90 text-ink-2 opacity-0 transition-opacity duration-120 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 ${focusRing}`}
      >
        <X size={12} strokeWidth={STROKE} />
      </button>
    </motion.div>
  );
}
