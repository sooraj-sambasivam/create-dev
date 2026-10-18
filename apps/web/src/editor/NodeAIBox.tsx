import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { motion } from "motion/react";
import type { Node } from "@create/shared";
import { useScreenStore } from "../store/screenStore";
import { TYPE_LABELS } from "./EditorContext";

const SUGGESTIONS: Record<string, string[]> = {
  heading: ["Make it punchier", "Shorter"],
  text: ["Rewrite friendlier", "Make it shorter"],
  button: ["Make it stand out", "Better label"],
  link: ["Turn into a button", "Better wording"],
  image: ["Different photo", "Make it square"],
  textbox: ["Add a helpful hint", "Make it a paragraph field"],
  select: ["Add more options", "Better label"],
  checkbox: ["Reword it", "Add a second one"],
  divider: ["Remove it", "Replace with a heading"],
  container: ["Add another item", "Make it look premium"],
  icon: ["Cartoon style", "Different icon"],
  avatar: ["Different person", "Show initials instead"],
  badge: ["Shorter", "Make it pop"],
  list: ["Add two more", "Use checkmarks"],
  rating: ["Add a review count", "Make it 5 stars"],
  table: ["Add a row", "Sort by price"],
  accordion: ["Add a question", "Shorter answers"],
  video: ["Make it square", "Remove it"],
  map: ["Make it taller", "Add the address below"],
  data: ["Change the label", "Show it as currency"],
  spacer: ["Remove it", "Make it bigger"],
};

/** Small prompt box attached under the selected element; edits only that element. */
export function NodeAIBox({ node, targetRef }: { node: Node; targetRef: RefObject<HTMLElement | null> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [alignRight, setAlignRight] = useState(false);
  const [inside, setInside] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const busy = useScreenStore((s) => s.aiBusyId === node.id);
  const otherBusy = useScreenStore((s) => s.aiBusyId !== null && s.aiBusyId !== node.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const label = TYPE_LABELS[node.type].toLowerCase();

  // Open toward the side with more room so the box stays inside the canvas.
  useLayoutEffect(() => {
    const el = targetRef.current;
    const root = el?.closest("[data-screen-root]");
    if (!el || !root) return;
    const r = el.getBoundingClientRect();
    const c = root.getBoundingClientRect();
    setAlignRight(r.left - c.left > c.width * 0.55);
    // Tall elements (whole sections) get the box at their top so it stays on screen.
    setInside(r.height > 320);
  }, [targetRef, node.id]);

  // Bring the box into view when it opens below the visible area.
  useLayoutEffect(() => {
    boxRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [node.id, inside]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setError(null);
    setReply(null);
    const result = await useScreenStore.getState().editNodeWithAI(node.id, text);
    if (result.error) setError(result.error);
    else {
      setValue("");
      if (result.summary) setReply(result.summary);
    }
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <motion.div
      ref={boxRef}
      data-ai-box
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`absolute z-40 w-80 max-w-[min(20rem,90vw)] ${inside ? "top-3" : "top-full mt-2.5"} ${alignRight ? (inside ? "right-3" : "right-0") : inside ? "left-3" : "left-0"}`}
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onKeyDown={stop}
    >
      <div className="rounded-xl border border-line bg-surface p-1.5 text-left shadow-soft">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void send(value);
          }}
        >
          <span className="pl-1.5 text-ink-2" aria-hidden>
            ✦
          </span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") inputRef.current?.blur();
            }}
            disabled={busy}
            placeholder={busy ? `Updating this ${label}…` : otherBusy ? "Queued after the current edit…" : `Ask AI to change this ${label}…`}
            aria-label={`Ask AI to change this ${label}`}
            className="min-w-0 flex-1 bg-transparent h-8 text-sm text-ink outline-none placeholder:text-ink-3"
          />
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="h-8 rounded-lg bg-accent px-3 text-sm font-medium text-white dark:text-shell transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
          >
            {busy ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/40 border-t-current align-[-2px]" />
            ) : (
              "Go"
            )}
          </button>
        </form>
        {error ? (
          <p className="px-2 pb-1 pt-1.5 text-xs text-bad">{error}</p>
        ) : reply ? (
          <p className="px-2 pb-1 pt-1.5 text-xs text-ok">{reply}</p>
        ) : (
          !busy && (
            <div className="flex flex-wrap gap-1 px-1 pb-0.5 pt-1.5">
              {(SUGGESTIONS[node.type] ?? []).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
              <span className="ml-auto self-center pr-1 text-xs text-ink-3">/ to focus</span>
            </div>
          )
        )}
      </div>
    </motion.div>
  );
}
