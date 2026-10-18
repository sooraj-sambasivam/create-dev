import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Database, Download, Ellipsis, Folder, Plus, TextCursorInput, X, type LucideIcon } from "lucide-react";
import { listSubmissions, resolveAppId } from "../../components/forms";
import { useScreenStore } from "../../store/screenStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useLiftLog } from "../thread/liftLog";
import { useRightPanel } from "../rightPanel";
import { contextStats } from "./stats";
import { ICON, STROKE, button, focusRing, menuItem, surface, text } from "../../ui/styles";
import { originFor, popover, scaleIn, useReducedMotionSafe } from "../../ui/motion";

/** Project name: its project, else the chat title, else the page title. */
function useProjectName(): string {
  return useWorkspaceStore((s) => {
    const chat = s.chats.find((c) => c.id === s.activeChatId);
    const project = chat?.projectId ? s.projects.find((p) => p.id === chat.projectId) : null;
    return project?.name ?? chat?.title ?? "Untitled project";
  });
}

/** Form submissions received. One quiet fetch when there are forms; failures count as zero. */
function useRowsReceived(forms: number, turns: number): number {
  const [rows, setRows] = useState(0);
  useEffect(() => {
    if (forms === 0) {
      setRows(0);
      return;
    }
    const ctrl = new AbortController();
    listSubmissions(resolveAppId(), ctrl.signal).then(
      (list) => setRows(list.length),
      () => {},
    );
    return () => ctrl.abort();
  }, [forms, turns]);
  return rows;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex h-8 items-center justify-between gap-3">
      <span className={`${text.ui} text-ink-2`}>{label}</span>
      <span className={`${text.ui} tabular-nums`}>{value}</span>
    </div>
  );
}

function Source({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: ReactNode }) {
  return (
    <div className="flex h-8 items-center gap-2">
      <Icon size={ICON.md} strokeWidth={STROKE} className="shrink-0 text-ink-2" aria-hidden />
      <span className={`${text.ui} min-w-0 flex-1 truncate`}>{label}</span>
      {value !== undefined && <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{value}</span>}
    </div>
  );
}

/**
 * Right context card: project, what changed, and where the data comes from. Floats top-right inside
 * the main card while the right panel is closed. `wide` = the gutter fits it; otherwise it folds into
 * a pill that opens the same card on demand.
 */
export function ContextCard({ wide }: { wide: boolean }) {
  const { v } = useReducedMotionSafe();
  const openTab = useRightPanel((s) => s.openTab);
  const history = useScreenStore((s) => s.history);
  const screen = useScreenStore((s) => s.screen);
  const lifts = useLiftLog((s) => s.entries);
  const name = useProjectName();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const base = contextStats({ history, screen, lifts });
  const rowsReceived = useRowsReceived(base.forms, history.length);
  const stats = { ...base, rowsReceived };
  const shown = wide || open;

  // Outside click and Escape close the menu, then the folded card.
  useEffect(() => {
    if (!menu && !(open && !wide)) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) {
        setMenu(false);
        if (!wide) setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menu) setMenu(false);
      else if (!wide) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu, open, wide]);

  const viewAll = () => {
    setMenu(false);
    openTab("backend");
  };

  return (
    <div ref={ref} className="pointer-events-none absolute right-4 top-3 z-20 flex justify-end" data-testid="context-card-slot">
      <AnimatePresence mode="wait" initial={false}>
        {shown ? (
          <motion.aside
            key="card"
            variants={v(scaleIn)}
            initial="hidden"
            animate="show"
            exit="exit"
            style={{ transformOrigin: "top right" }}
            aria-label="Project context"
            data-testid="context-card"
            data-part="context-card"
            className={`${surface.card} pointer-events-auto w-[280px] p-3`}
          >
            <div className="flex h-8 items-center gap-2">
              <Folder size={ICON.lg} strokeWidth={STROKE} className="shrink-0 text-ink-2" aria-hidden />
              <h2 className={`${text.ui} min-w-0 flex-1 truncate font-medium`}>{name}</h2>
              <div className="relative flex items-center">
                <button type="button" aria-label="Project options" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className={button.icon}>
                  <Ellipsis size={ICON.lg} strokeWidth={STROKE} aria-hidden />
                </button>
                <AnimatePresence>
                  {menu && (
                    <motion.div
                      role="menu"
                      variants={v(popover)}
                      initial="hidden"
                      animate="show"
                      exit="exit"
                      style={{ transformOrigin: originFor("down", "right") }}
                      className={`${surface.menu} absolute right-0 top-full z-30 mt-1`}
                    >
                      <button type="button" role="menuitem" className={menuItem} onClick={viewAll}>
                        View backend
                      </button>
                      <button type="button" role="menuitem" className={menuItem} disabled={!screen} onClick={() => { setMenu(false); openTab("output"); }}>
                        View page
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {!wide && (
                <button type="button" aria-label="Close" onClick={() => setOpen(false)} className={button.icon}>
                  <X size={ICON.lg} strokeWidth={STROKE} aria-hidden />
                </button>
              )}
            </div>

            <section aria-label="Changes" className="mt-2 border-t border-line pt-2">
              <h3 className="flex h-6 items-center text-[12px] font-medium text-ink-3">Changes</h3>
              <Stat label="Elements edited" value={stats.edited} />
              <Stat label="Rows received" value={stats.rowsReceived} />
            </section>

            <section aria-label="Sources" className="mt-2 border-t border-line pt-2">
              <div className="flex h-6 items-center justify-between">
                <h3 className="text-[12px] font-medium text-ink-3">Sources</h3>
                <button type="button" aria-label="Add a source" onClick={viewAll} className={button.iconSm}>
                  <Plus size={ICON.md} strokeWidth={STROKE} aria-hidden />
                </button>
              </div>
              <Source icon={Database} label="Live data sources" value={stats.dataSources} />
              <Source icon={TextCursorInput} label="Forms" value={stats.forms} />
              {stats.imports.length > 0 ? (
                stats.imports.slice(0, 2).map((site) => <Source key={site} icon={Download} label={`Imported from ${site}`} />)
              ) : (
                <Source icon={Download} label="Imported from" value="None" />
              )}
            </section>

            <button type="button" onClick={viewAll} className={`${button.ghost} -mx-1 mt-2 w-[calc(100%+0.5rem)] justify-start`}>
              View all
            </button>
          </motion.aside>
        ) : (
          <motion.button
            key="pill"
            type="button"
            variants={v(scaleIn)}
            initial="hidden"
            animate="show"
            exit="exit"
            style={{ transformOrigin: "top right" }}
            aria-label="Show project context"
            aria-expanded={false}
            data-testid="context-pill"
            onClick={() => setOpen(true)}
            className={`${surface.pill} pointer-events-auto inline-flex h-8 max-w-[220px] items-center gap-2 px-3 text-[14px] text-ink-2 transition-colors duration-120 hover:text-ink ${focusRing}`}
          >
            <Folder size={ICON.md} strokeWidth={STROKE} aria-hidden className="shrink-0" />
            <span className="min-w-0 truncate">{name}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
