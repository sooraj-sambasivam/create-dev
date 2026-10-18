import { Fragment } from "react";

export type KeyHint = { key: string; label: string };

/** The keys that work right now. Enter finishes the narration until something is pinned, then it acts. */
export function keyHints(o: { pinned: boolean }): KeyHint[] {
  return [
    { key: "move", label: "snap to a thing" },
    { key: "dwell · ]", label: "widen" },
    { key: "click", label: o.pinned ? "unpin" : "pin" },
    { key: "↵", label: o.pinned ? "act on it" : "finish" },
    { key: "esc", label: o.pinned ? "release" : "leave" },
  ];
}

/** The always-on key-hint bar, small and quiet, above the narrate bar. */
export function KeyHintBar({ pinned }: { pinned: boolean }) {
  const hints = keyHints({ pinned });
  return (
    <span className="flex items-center gap-1.5" data-testid="key-hint-bar">
      {hints.map((h, i) => (
        <Fragment key={h.key}>
          {i > 0 && <span aria-hidden="true" className="text-ink-3">·</span>}
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-line bg-tray px-1 font-mono text-[12px] leading-4 text-ink">{h.key}</kbd>
            <span>{h.label}</span>
          </span>
        </Fragment>
      ))}
    </span>
  );
}
