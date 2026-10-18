import { useState, type RefObject } from "react";
import { Check, ChevronDown, Image as ImageIcon, Monitor, Plus, ShieldCheck, Plug } from "lucide-react";
import type { EffortChoice, ModelChoice } from "@create/shared";
import {
  EFFORTS,
  EFFORT_NAMES,
  MODELS,
  MODEL_NAMES,
  MODEL_NOTES,
  modelEnabled,
  modelLabel,
  useComposerPrefs,
  type SwitchableProvider,
} from "../../store/composerPrefs";
import type { Health } from "../../lib/api";
import { ICON, STROKE, button, chip, dot, menuItem, segmented, text } from "../../ui/styles";
import { Popover } from "./Popover";
import { hasInkling, useServerInfo } from "./useHealth";
import { useId } from "react";
import { ActivePill } from "../../ui/ActivePill";

const ROW_ICON = { size: ICON.lg, strokeWidth: STROKE } as const;
const TRAY_ICON = { size: ICON.md, strokeWidth: STROKE } as const;
const LEAD = "shrink-0 text-ink-2";

/** "+" in the bottom row: attach files or lift from the screen. */
export function PlusMenu({ fileRef, onLift, uploading, disabled }: { fileRef: RefObject<HTMLInputElement | null>; onLift: () => void; uploading: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      panel={
        <div>
          <button
            type="button"
            role="menuitem"
            disabled={uploading}
            className={`${menuItem} disabled:opacity-50`}
            onClick={() => {
              setOpen(false);
              fileRef.current?.click();
            }}
          >
            <ImageIcon {...ROW_ICON} className={LEAD} />
            <span className="min-w-0 flex-1 truncate">{uploading ? "Uploading…" : "Add photos or files"}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItem}
            onClick={() => {
              setOpen(false);
              onLift();
            }}
          >
            <Monitor {...ROW_ICON} className={LEAD} />
            <span className="min-w-0 flex-1 truncate">Lift from screen</span>
          </button>
        </div>
      }
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add"
        title="Add photos, files, or lift from screen"
        data-testid="plus-button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={button.icon}
      >
        <Plus size={ICON.lg} strokeWidth={STROKE} aria-hidden />
      </button>
    </Popover>
  );
}

/** "Approve for me": ON applies AI edits at once; OFF stages them for review. */
export function ApproveToggle() {
  const approve = useComposerPrefs((s) => s.approve);
  const setApprove = useComposerPrefs((s) => s.setApprove);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={approve}
      data-testid="approve-toggle"
      title={approve ? "AI edits apply right away. Click to review them first." : "AI edits wait for your Apply. Click to apply right away."}
      onClick={() => setApprove(!approve)}
      className={`${button.ghost} ${approve ? "!bg-hover !text-ink" : ""}`}
    >
      <ShieldCheck {...TRAY_ICON} aria-hidden />
      <span>Approve for me</span>
    </button>
  );
}

function EffortSegmented({ effort, onChange }: { effort: EffortChoice; onChange: (e: EffortChoice) => void }) {
  const pillId = useId();
  return (
    <div role="group" aria-label="Effort" className={`${segmented.root} w-full`}>
      {EFFORTS.map((e) => {
        const active = e === effort;
        return (
          <button
            key={e}
            type="button"
            aria-pressed={active}
            data-testid={`effort-${e}`}
            onClick={() => onChange(e)}
            className={`${segmented.item} flex-1 px-2 ${active ? segmented.active : ""}`}
          >
            {active && <ActivePill layoutId={pillId} />}
            {EFFORT_NAMES[e]}
          </button>
        );
      })}
    </div>
  );
}

/** Model + effort picker. The label reads "Sonnet 5.5 Medium": name in ink, effort in ink-3. */
export function ModelPicker() {
  const [open, setOpen] = useState(false);
  const model = useComposerPrefs((s) => s.model);
  const effort = useComposerPrefs((s) => s.effort);
  const disabled = useComposerPrefs((s) => s.disabled);
  const info = useServerInfo();
  const avail = (id: ModelChoice) => info.models.find((m) => m.id === id)?.available ?? false;

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="right"
      wide
      panel={
        <div>
          <div className={`${text.meta} px-2 pt-1.5 pb-1`}>Model</div>
          {MODELS.map((id) => {
            const on = modelEnabled(id, disabled);
            const ok = avail(id) && on;
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={model === id}
                aria-disabled={!ok || undefined}
                data-testid={`model-${id}`}
                title={!on ? "Turned off in Plugins" : !avail(id) ? "Add its API key on the server to use it" : undefined}
                className={`${menuItem} h-auto min-h-10 py-1 ${ok ? "" : "cursor-default text-ink-3 hover:bg-transparent"}`}
                onClick={() => {
                  if (!ok) return;
                  useComposerPrefs.getState().setModel(id);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{MODEL_NAMES[id]}</span>
                  <span className="block truncate text-[12px] leading-4 text-ink-3">{MODEL_NOTES[id]}</span>
                </span>
                {!on ? <span className="text-[12px] text-ink-3">Off</span> : !avail(id) ? <span className="text-[12px] text-ink-3">Add key</span> : model === id ? <Check {...ROW_ICON} /> : null}
              </button>
            );
          })}
          <div aria-hidden="true" className="mx-2 my-1 h-px bg-line" />
          <div className={`${text.meta} px-2 pt-1 pb-1`}>Effort</div>
          <div className="px-1 pb-1">
            <EffortSegmented effort={effort} onChange={(e) => useComposerPrefs.getState().setEffort(e)} />
          </div>
        </div>
      }
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Model: ${modelLabel(model, effort)}`}
        data-testid="model-picker"
        onClick={() => setOpen((o) => !o)}
        className={`${button.ghost} gap-1 px-2`}
      >
        <span className="text-ink">{MODEL_NAMES[model]}</span>
        <span className="text-ink-3">{EFFORT_NAMES[effort]}</span>
        <ChevronDown size={ICON.sm} strokeWidth={STROKE} aria-hidden className="text-ink-3" />
      </button>
    </Popover>
  );
}

interface PluginRow {
  key: string;
  label: string;
  note: string;
  connected: (h: Health | null) => boolean;
  provider?: SwitchableProvider;
}

export const PLUGIN_ROWS: readonly PluginRow[] = [
  { key: "live", label: "Live data", note: "Always on", connected: (h) => h !== null },
  { key: "perceptron", label: "Perceptron vision", note: "Always on when connected", connected: (h) => Boolean(h?.hasPerceptron) },
  { key: "jev", label: "Jev intent", note: "Always on when connected", connected: (h) => Boolean(h?.hasTypesafe) },
  { key: "gemini", label: "Gemini", note: "Model provider", connected: (h) => Boolean(h?.hasGemini), provider: "gemini" },
  { key: "inkling", label: "Inkling", note: "Model provider", connected: (h) => Boolean(hasInkling(h)), provider: "inkling" },
  { key: "mongo", label: "MongoDB Atlas", note: "Always on when connected", connected: (h) => Boolean(h?.hasMongo) },
];

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-120 ${on ? "bg-ink" : "bg-line"}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-soft transition-transform duration-120 ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}

/** Integrations that power Create, with live status. Gemini and Inkling can be switched off here. */
export function PluginsMenu() {
  const [open, setOpen] = useState(false);
  const disabled = useComposerPrefs((s) => s.disabled);
  const info = useServerInfo();
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      side="down"
      wide
      panel={
        <div>
          <div className={`${text.meta} px-2 pt-1.5 pb-1`}>Plugins</div>
          <ul>
            {PLUGIN_ROWS.map((p) => {
              const ok = p.connected(info.health);
              const on = p.provider ? !disabled.includes(p.provider) : true;
              return (
                <li key={p.key} data-testid={`plugin-${p.key}`} className="flex min-h-10 items-center gap-2 rounded-lg px-2 py-1">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ink">{p.label}</span>
                    <span className={`${chip.status} !h-auto !bg-transparent !p-0`}>
                      <span className={ok ? dot.ok : dot.warn} aria-hidden />
                      {!info.loaded ? "Checking" : ok ? "Connected" : "Needs key"}
                      <span className="text-ink-3">· {p.note}</span>
                    </span>
                  </span>
                  {p.provider ? (
                    <Switch on={on} label={`${p.label} ${on ? "on" : "off"}`} onChange={(v) => useComposerPrefs.getState().setProvider(p.provider!, v)} />
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="px-2 pt-1 pb-1.5 text-[12px] leading-4 text-ink-3">Only Gemini and Inkling can be switched off. The rest run whenever their key is set.</p>
        </div>
      }
    >
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Plugins" onClick={() => setOpen((o) => !o)} className={button.ghost}>
        <Plug {...TRAY_ICON} className="shrink-0" />
        <span>Plugins</span>
      </button>
    </Popover>
  );
}
