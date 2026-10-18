import { Play, X } from "lucide-react";
import { useScreenStore } from "../store/screenStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useMotionStore } from "./motionStore";
import { MOTION_PRESET_IDS, PRESETS, cssAttr } from "./presets";

/** Restart the CSS animation on a rendered node. */
export function replayNode(id: string): void {
  const el = document.querySelector<HTMLElement>(`[data-screen-root] [data-node-id="${cssAttr(id)}"]`);
  if (!el) return;
  el.style.animation = "none";
  void el.offsetHeight;
  el.style.animation = "";
}

/** Compact "Motion" section for the selected node. */
export function MotionControls() {
  const selectedId = useScreenStore((s) => s.selectedId);
  const chatId = useWorkspaceStore((s) => s.activeChatId);
  const current = useMotionStore((s) => (chatId && selectedId ? s.byChat[chatId]?.[selectedId] : undefined));
  const setPreset = useMotionStore((s) => s.setPreset);

  if (!selectedId || !chatId) {
    return <p className="px-3 py-2 text-[12px] text-ink-3">Select an element to animate it.</p>;
  }
  return (
    <section className="px-3 py-2" aria-label="Motion">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] text-ink-3">Motion</h3>
        <div className="flex items-center gap-1">
          {current && (
            <button type="button" onClick={() => setPreset(chatId, selectedId, null)} className="flex h-6 items-center gap-1 rounded-[6px] px-2 text-[12px] text-ink-2 hover:bg-hover">
              <X size={12} strokeWidth={1.75} /> None
            </button>
          )}
          <button type="button" disabled={!current} onClick={() => replayNode(selectedId)} className="flex h-6 items-center gap-1 rounded-[6px] px-2 text-[12px] text-ink-2 hover:bg-hover disabled:text-ink-3 disabled:hover:bg-transparent">
            <Play size={12} strokeWidth={1.75} /> Replay
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {MOTION_PRESET_IDS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={current === p}
            onClick={() => {
              setPreset(chatId, selectedId, current === p ? null : p);
              requestAnimationFrame(() => requestAnimationFrame(() => replayNode(selectedId)));
            }}
            className={`h-6 rounded-[6px] border px-2 text-[12px] ${current === p ? "border-accent text-ink" : "border-line text-ink-2 hover:bg-hover"}`}
          >
            {PRESETS[p].label}
          </button>
        ))}
      </div>
    </section>
  );
}
