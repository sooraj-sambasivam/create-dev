import { useEffect, useRef, useState } from "react";
import { Contrast, Copy, Moon, PanelRight, Share, Sun, X } from "lucide-react";
import { useScreenStore } from "../store/screenStore";
import { ChatMenu, type ChatProject } from "./ChatMenu";
import { THEME_LABEL, useThemeStore, type ThemePreference } from "./theme";

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

const ghostButton =
  "inline-flex h-8 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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
    state.kind === "copied" ? "Copied" : state.kind === "failed" ? "Share failed" : "Share";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          void share();
        }}
        disabled={busy}
        aria-busy={busy}
        title="Copy share link"
        aria-label={state.kind === "idle" ? "Copy share link" : undefined}
        className={`${ghostButton} gap-1.5 px-2 text-[14px]`}
      >
        <Share size={18} strokeWidth={1.75} aria-hidden="true" />
        <span role="status" aria-live="polite">
          {label}
        </span>
      </button>
      {state.kind === "manual" ? (
        <div
          role="group"
          aria-label="Share link"
          className="absolute right-0 top-full z-40 mt-1 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-2 shadow-soft"
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
              className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-[14px] text-ink outline-none focus:border-accent"
            />
            <button
              type="button"
              aria-label="Copy share link"
              title="Copy"
              onClick={() => {
                void copyManual(state.url);
              }}
              className={`${ghostButton} w-8`}
            >
              <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Dismiss share link"
              title="Dismiss"
              onClick={() => setState({ kind: "idle" })}
              className={`${ghostButton} w-8`}
            >
              <X size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
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
      title={`${label}. Click to switch`}
      className={`${ghostButton} gap-1.5 px-2 text-[14px]`}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="hidden sm:inline">{THEME_LABEL[theme]}</span>
    </button>
  );
}

export function Header({ pageTitle, chat, projects, outputOpen, actions, onShare }: HeaderProps) {
  const assets = useScreenStore((s) => s.assets);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-4">
      <h1 className="min-w-0 flex-1 truncate text-[14px] font-normal text-ink" title={pageTitle}>
        {pageTitle}
      </h1>
      <div className="flex shrink-0 items-center gap-1">
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
          aria-label={outputOpen ? "Hide output panel" : "Show output panel"}
          aria-pressed={outputOpen}
          title={outputOpen ? "Hide output panel" : "Show output panel"}
          className={`${ghostButton} w-8 ${outputOpen ? "bg-hover text-ink" : ""}`}
        >
          <PanelRight size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
