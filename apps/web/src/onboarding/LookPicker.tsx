import { useId, useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import "./LookPicker.css";
import { LOOKS, LOOK_BLURB, LOOK_LABEL, LOOK_SWATCH, useLook, type Look } from "../ui/look";
import { focusRing, ICON, STROKE } from "../ui/styles";

/** Miniature of the pointing moment: a table, the look's annotation on one cell, and Pip. Decorative. */
function Scene({ look }: { look: Look }) {
  const paper = look === "paper";
  return (
    <span aria-hidden="true" className="lkp-scene block"  data-look={look}>
      <span className="lkp-row lkp-head"><span>Cafe</span><span>Rating</span><span /></span>
      <span className="lkp-row">
        <span>Corner Cafe</span>
        <span className="lkp-cell">
          {paper ? (
            <>
              <span className="lkp-hl" />
              <svg className="lkp-mark" viewBox="0 0 60 30" preserveAspectRatio="none"><path d="M8 5 C 24 -1, 52 3, 56 15 C 58 26, 30 29, 12 26 C -2 22, 0 8, 14 4" pathLength="120" /></svg>
              <span className="lkp-note">this one</span>
            </>
          ) : (
            <>
              <span className="lkp-spot" />
              <span className="lkp-chip">this</span>
            </>
          )}
          4.9
        </span>
        <span />
      </span>
      <span className="lkp-row"><span>Bean There</span><span>4.2</span><span /></span>
      <span className="lkp-row"><span>Daily Grind</span><span>4.6</span><span /></span>
      <span className={`lkp-pip ${paper ? "blot" : "orb"}`} />
    </span>
  );
}

/**
 * Choose between Paper and Luminous. Radio semantics: arrows move and apply the choice, Tab enters and
 * leaves the group. Selecting calls setLook, so the whole app (and this flow) changes at once.
 */
export function LookPicker({ compact = false }: { compact?: boolean }) {
  const look = useLook((s) => s.look);
  const setLook = useLook((s) => s.setLook);
  const root = useRef<HTMLDivElement>(null);
  const uid = useId();

  const onKeyDown = (e: KeyboardEvent) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    const next = LOOKS[(LOOKS.indexOf(look) + dir + LOOKS.length) % LOOKS.length];
    setLook(next);
    requestAnimationFrame(() => root.current?.querySelectorAll<HTMLElement>('[role="radio"]')[LOOKS.indexOf(next)]?.focus());
  };

  return (
    <div ref={root} role="radiogroup" aria-label="Look" onKeyDown={onKeyDown} className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-1 min-[520px]:grid-cols-2"}`}>
      {LOOKS.map((l) => {
        const sel = l === look;
        const descId = `${uid}-${l}`;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={sel}
            aria-describedby={descId}
            tabIndex={sel ? 0 : -1}
            onClick={() => setLook(l)}
            className={`lkp rounded-xl border-2 bg-surface p-2.5 transition-colors duration-120 ${focusRing} ${sel ? "border-accent" : "border-line hover:border-ink-3"}`}
          >
            <Scene look={l} />
            <span className="flex items-start gap-2 px-1 pb-1">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-[16px] font-medium leading-6 text-ink">
                  {LOOK_LABEL[l]}
                  <span aria-hidden="true" className="flex gap-1">
                    {LOOK_SWATCH[l].map((c) => <span key={c} className="size-2.5 rounded-full border border-line" style={{ background: c }} />)}
                  </span>
                </span>
                <span id={descId} className={`${compact ? "sr-only" : "text-[14px] leading-5 text-ink-2"}`}>{LOOK_BLURB[l]}</span>
              </span>
              <span aria-hidden="true" className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${sel ? "bg-accent text-on-accent" : "border border-line"}`}>
                {sel && <Check size={ICON.sm} strokeWidth={STROKE} />}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
