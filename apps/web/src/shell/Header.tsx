import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Contrast, Copy, Moon, PanelRight, Share, Sun, X } from "lucide-react";
import { useScreenStore } from "../store/screenStore";
import { useWorkMode, type WorkMode } from "../store/modeStore";
import { ActivePill } from "../ui/ActivePill";
import { ChatMenu, type ChatProject } from "./ChatMenu";
import { THEME_LABEL, useThemeStore, type ThemePreference } from "./theme";
import { ICON, STROKE, button, input, segmented, surface } from "../ui/styles";
import { duration, ease, originFor, popover, useReducedMotionSafe } from "../ui/motion";

export type { ChatProject };

/** The chat the header acts on. */
export interface HeaderChat {
  id: string;
  title: string;
  archived: boolean;
  projectId: string | null;
}

/**
 * Chat and output actions. Each receives the active chat's id where it applies, so the
 * integrator can bind these to the workspace store (renameChat, archiveChat, deleteChat,
 * moveChat, createProject, toggleOutput) without this file importing that store.
 */
export interface WorkspaceActions {
  renameChat: (chatId: string, title: string) => void;
  archiveChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  moveChat: (chatId: string, projectId: string | null) => void;
  /** Creates a project named `name` and moves `chatId` into it. */
  createProject: (name: string, chatId: string) => void;
  toggleOutput: () => void;
}

/**
 * Result of a share attempt:
 * - `true`: the link was created and copied.
 * - `{ url }`: the link was created but the clipboard refused it. The header shows the URL so
 *   the user can copy it by hand.
 * - `false`, or a thrown error: sharing failed.
 */
export type ShareOutcome = boolean | { url: string };

export interface HeaderProps {
  /** Left-side title: the chat title, so a rename shows here at once. */
  pageTitle: string;
  chat: HeaderChat;
  projects: ChatProject[];
  outputOpen: boolean;
  actions: WorkspaceActions;
  /**
   * Wired to share links by the integrator. When omitted, Share copies the current URL. See
   * ShareOutcome for what to resolve with.
   */
  onShare?: () => ShareOutcome | Promise<ShareOutcome>;
}

/** Toggle state of an icon button: ink on hover fill (DESIGN.md). */
const iconActive = button.icon.replace("text-ink-2", "bg-hover text-ink");

const COPIED_MS = 1600;
const FAILED_MS = 3000;

/**
 * Copies `href` with the given clipboard. Returns true on success, false when there is no
 * clipboard or the write is refused. Never throws.
 */
export async function copyShareLink(
  href: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined,
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(href);
    return true;
  } catch {
    return false;
  }
}

type ShareState =
  | { kind: "idle" }
  | { kind: "copied" }
  | { kind: "failed" }
  | { kind: "manual"; url: string; copyFailed?: boolean };

/** Normalises a handler's result. Anything that is not a documented shape counts as a failure. */
function interpret(outcome: unknown): ShareState {
  if (outcome === true) return { kind: "copied" };
  if (outcome && typeof outcome === "object" && typeof (outcome as { url?: unknown }).url === "string") {
    const url = (outcome as { url: string }).url;
    if (url) return { kind: "manual", url };
  }
  return { kind: "failed" };
}

export function ShareButton({ onShare }: { onShare?: () => ShareOutcome | Promise<ShareOutcome> }) {
  const [state, setState] = useState<ShareState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const { v } = useReducedMotionSafe();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function settle(next: ShareState, resetAfter?: number) {
    window.clearTimeout(timer.current);
    setState(next);
    if (resetAfter !== undefined) {
      timer.current = window.setTimeout(() => setState({ kind: "idle" }), resetAfter);
    }
  }

  async function share() {
    if (busy) return;
    setBusy(true);
    try {
      let next: ShareState;
      if (onShare) {
        try {
          next = interpret(await onShare());
        } catch {
          next = { kind: "failed" };
        }
      } else {
        const href = window.location.href;
        const copied = await copyShareLink(
          href,
          typeof navigator !== "undefined" ? navigator.clipboard : undefined,
        );
        next = copied ? { kind: "copied" } : { kind: "manual", url: href };
      }
      if (next.kind === "copied") settle(next, COPIED_MS);
      else if (next.kind === "failed") settle(next, FAILED_MS);
      else settle(next);
    } finally {
      setBusy(false);
    }
  }

  async function copyManual(url: string) {
    const copied = await copyShareLink(
      url,
      typeof navigator !== "undefined" ? navigator.clipboard : undefined,
    );
    if (copied) {
      settle({ kind: "copied" }, COPIED_MS);
      return;
    }
    // The clipboard refused again. Select the link so the user can press Cmd/Ctrl+C.
    setState({ kind: "manual", url, copyFailed: true });
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }

  const label =
    state.kind === "copied" ? "Copied" : state.kind === "failed" ? "Couldn't share" : "Share";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          void share();
        }}
        disabled={busy}
        aria-busy={busy}
        title="Copy link"
        aria-label={state.kind === "idle" ? "Copy link" : undefined}
        className={`${button.ghost} @max-[560px]:!px-0 @max-[560px]:size-8`}
      >
        <Share size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" />
        <motion.span key={label} role="status" className="@max-[560px]:sr-only" aria-live="polite" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: duration.base, ease: ease.emphasized }}>
          {label}
        </motion.span>
      </button>
      <AnimatePresence>
      {state.kind === "manual" ? (
        <motion.div
          role="group"
          aria-label="Share link"
          variants={v(popover)}
          initial="hidden"
          animate="show"
          exit="exit"
          style={{ transformOrigin: originFor("down", "right") }}
          className={`${surface.card} absolute right-0 top-full z-40 mt-1 w-96 max-w-[calc(100vw-2rem)] p-1.5`}
        >
          <p className="px-1 pb-1.5 text-[12px] text-ink-3">
            {state.copyFailed
              ? "The clipboard is blocked. The link is selected: press Cmd/Ctrl+C."
              : "Link created. Copy it:"}
          </p>
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              readOnly
              value={state.url}
              aria-label="Share link"
              onFocus={(event) => event.currentTarget.select()}
              className={`${input} min-w-0 flex-1`}
            />
            <button
              type="button"
              aria-label="Copy link"
              title="Copy link"
              onClick={() => {
                void copyManual(state.url);
              }}
              className={button.icon}
            >
              <Copy size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Dismiss share link"
              title="Dismiss"
              onClick={() => setState({ kind: "idle" })}
              className={button.icon}
            >
              <X size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </div>
  );
}

const THEME_ICON: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Contrast,
};

/** Header control that cycles the shell theme light, dark, system. Persisted by theme.ts. */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const cycleTheme = useThemeStore((s) => s.cycleTheme);
  const Icon = THEME_ICON[theme];
  const label = `Theme: ${THEME_LABEL[theme]}`;

  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={label}
      title={`${label}. Click to switch.`}
      className={button.icon}
    >
      <Icon size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" />
    </button>
  );
}

/** UI copy for the two modes. The stored value for Work stays "code". */
export const MODE_LABEL: Record<WorkMode, string> = { chat: "Chat", code: "Work" };
const MODE_HINT: Record<WorkMode, string> = { chat: "Chat: ask questions", code: "Work: build and edit" };

/** Chat answers and never edits; Work builds and edits. Lives in the header centre. */
export function ModeToggle() {
  const mode = useWorkMode((s) => s.mode);
  const setMode = useWorkMode((s) => s.setMode);
  const pillId = useId();
  return (
    <div role="group" aria-label="Chat or Work" data-testid="work-mode" className={segmented.root}>
      {(["chat", "code"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            data-testid={`work-mode-${m}`}
            title={MODE_HINT[m]}
            onClick={() => setMode(m)}
            className={`${segmented.item} ${active ? segmented.active : ""}`}
          >
            {active && <ActivePill layoutId={pillId} />}
            {MODE_LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}

export function Header({ pageTitle, chat, projects, outputOpen, actions, onShare }: HeaderProps) {
  const assets = useScreenStore((s) => s.assets);

  return (
    // @container: below a 560px card the Share label folds into its icon (see ShareButton).
    // Three columns: the title takes what is left and truncates, Chat | Work stays centred, and the
    // actions column never shrinks below its content, so nothing overlaps.
    <header className="@container grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] items-center gap-4 px-4">
      <h1 data-part="page-title" className="min-w-0 truncate text-[14px] font-normal text-ink" title={pageTitle}>
        {pageTitle}
      </h1>
      <ModeToggle />
      <div className="flex shrink-0 items-center justify-self-end gap-1">
        <ShareButton onShare={onShare} />
        <ThemeToggle />
        <ChatMenu
          title={chat.title}
          archived={chat.archived}
          projectId={chat.projectId}
          projects={projects}
          assets={assets}
          onRename={(title) => actions.renameChat(chat.id, title)}
          onArchive={() => actions.archiveChat(chat.id)}
          onDelete={() => actions.deleteChat(chat.id)}
          onMoveToProject={(projectId) => actions.moveChat(chat.id, projectId)}
          onCreateProject={(name) => actions.createProject(name, chat.id)}
        />
        <button
          type="button"
          onClick={actions.toggleOutput}
          aria-label={outputOpen ? "Hide side panel" : "Show side panel"}
          aria-pressed={outputOpen}
          title={outputOpen ? "Hide side panel" : "Show side panel"}
          className={outputOpen ? iconActive : button.icon}
        >
          <PanelRight size={ICON.lg} strokeWidth={STROKE} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
