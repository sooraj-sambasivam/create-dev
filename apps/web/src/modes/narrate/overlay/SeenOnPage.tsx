import { useMemo, useState } from "react";
import { ChevronDown, Eye } from "lucide-react";
import type { Entity } from "./entities";
import { entityLine, groupEntities } from "./entities";
import { ICON, STROKE } from "../../../ui/styles";

const KIND_TITLE = { table: "Tables", price: "Prices", image: "Images", heading: "Headings" } as const;

/**
 * "Seen on this page": everything the pointer can bind to, from the page's own nodes. Hover previews an
 * item's outline, click binds it. Collapsed to one pill by default.
 */
export function SeenOnPage({
  entities,
  activeId,
  onPreview,
  onBind,
}: {
  entities: readonly Entity[];
  activeId: string | null;
  onPreview(id: string | null): void;
  onBind(entity: Entity): void;
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupEntities(entities), [entities]);
  if (entities.length === 0) return null;
  return (
    <div className="pointer-events-auto w-[248px] rounded-xl border border-line bg-surface shadow-soft" data-testid="seen-on-page">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center gap-2 rounded-xl px-3 text-left text-[14px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Eye size={ICON.md} strokeWidth={STROKE} className="shrink-0 text-ink-2" />
        <span className="flex-1 truncate">Seen on this page</span>
        <span className="font-mono text-[12px] tabular-nums text-ink-2">{entities.length}</span>
        <ChevronDown size={ICON.sm} strokeWidth={STROKE} className={`shrink-0 text-ink-2 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="max-h-[36vh] overflow-y-auto border-t border-line p-1.5" onMouseLeave={() => onPreview(null)}>
          {groups.map((g) => (
            <section key={g.kind} aria-label={KIND_TITLE[g.kind]} className="pb-1">
              <h3 className="px-2 pb-0.5 pt-1 text-[12px] font-medium leading-4 text-ink-3">{KIND_TITLE[g.kind]}</h3>
              <ul>
                {g.items.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onMouseEnter={() => onPreview(e.id)}
                      onFocus={() => onPreview(e.id)}
                      onBlur={() => onPreview(null)}
                      onClick={() => onBind(e)}
                      className={`flex h-8 w-full items-center rounded-lg px-2 text-left text-[14px] text-ink outline-none transition-colors duration-100 hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent ${activeId === e.id ? "bg-selected" : ""}`}
                    >
                      <span className="truncate">{entityLine(e)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
