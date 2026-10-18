import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { ScreenSchema, type Screen } from "@create/shared";
import { cancelInFlight, useScreenStore, type HistoryEntry } from "./screenStore";

export type { HistoryEntry };

/**
 * Chats and projects around the single-page builder in screenStore.
 *
 * The active chat is the one whose page lives in useScreenStore. Its screen and history are
 * mirrored back into the chat as they change, and switching chats saves the old one and loads
 * the new one into useScreenStore.
 *
 * Two safeguards keep results in the right chat:
 * - Chats cannot be switched or replaced while the page is busy (an AI request or a voice
 *   transcription is in flight). Those requests write into the live page when they finish.
 * - Several tabs share one storage key. Each write merges with what is already stored
 *   (chats by id and updatedAt, deleted chats by tombstone), and a storage event from another
 *   tab reloads the workspace once this tab is idle.
 */

export interface Project {
  id: string;
  name: string;
}

export interface Chat {
  id: string;
  title: string;
  projectId: string | null;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  screen: Screen | null;
  history: HistoryEntry[];
  /** True once the user has renamed the chat; stops auto-titling from screen.title. */
  renamed?: boolean;
}

export interface RunLogEntry {
  id: string;
  /** Epoch milliseconds. */
  at: number;
  kind: string;
  detail: string;
}

export const RUN_LOG_LIMIT = 200;
export const DEFAULT_CHAT_TITLE = "Untitled chat";
export const DEFAULT_PROJECT_NAME = "Untitled project";
export const WORKSPACE_STORAGE_KEY = "create-dev-workspace";

/** How long chat mirroring waits after a screen change before writing to storage. */
const SYNC_DELAY_MS = 250;
/** How many deleted chat ids are remembered so a stale tab cannot bring them back. */
const DELETED_LIMIT = 500;

export interface WorkspaceState {
  chats: Chat[];
  projects: Project[];
  activeChatId: string | null;
  /** @deprecated The Output pane state moved to the right panel store (shell/rightPanel). Never read or written here. */
  outputOpen?: boolean;
  runLog: RunLogEntry[];
  /** Ids of deleted chats, kept so another tab's stale copy cannot restore them. */
  deletedChatIds: string[];

  /**
   * Save the active chat, start a blank one (optionally inside a project) and make it active. Returns its id.
   * While the page is busy this does nothing and returns the current active id.
   */
  newChat: (projectId?: string | null) => string;
  /** Save the active chat and load another one into useScreenStore. No-op for unknown ids, and while the page is busy. */
  selectChat: (id: string) => void;
  /** Rename a chat. Empty titles are ignored. The title stops following screen.title. */
  renameChat: (id: string, title: string) => void;
  /**
   * Delete a chat. If it was active, the most recently updated remaining chat (or a new blank one) becomes active.
   * Deleting the active chat is refused while the page is busy.
   */
  deleteChat: (id: string) => void;
  /** Toggle a chat's archived flag. */
  archiveChat: (id: string) => void;
  /** Put a chat in a project, or out of all projects with null. Unknown project ids are ignored. */
  moveChat: (chatId: string, projectId: string | null) => void;
  /** Create a project and return its id. Empty names become "Untitled project". */
  createProject: (name: string, moveChatId?: string) => string;
  /** Append to the run log, keeping the most recent RUN_LOG_LIMIT entries. */
  log: (kind: string, detail: string) => void;
}

function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeChat(over: Partial<Chat> = {}): Chat {
  const now = Date.now();
  return {
    id: uid(),
    title: DEFAULT_CHAT_TITLE,
    projectId: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
    screen: null,
    history: [],
    renamed: false,
    ...over,
  };
}

function mostRecent(chats: Chat[]): Chat | undefined {
  return chats.reduce<Chat | undefined>((best, c) => (!best || c.updatedAt > best.updatedAt ? c : best), undefined);
}

/** True while an AI request or transcription may still write into the live page. */
function isBusy(): boolean {
  const s = useScreenStore.getState();
  return s.status === "loading" || s.status === "transcribing" || s.aiBusyId !== null;
}

/** Record a refused chat action in the run log so the user can see why nothing happened. */
function refuse(action: string) {
  useWorkspaceStore.getState().log("chat", `${action} is unavailable while the page is being changed.`);
}

function tombstone(list: string[], id: string): string[] {
  return [...list.filter((x) => x !== id), id].slice(-DELETED_LIMIT);
}

/** Copy the live page into a chat, keeping the title in step with screen.title unless the user renamed it. */
function syncChat(chat: Chat, screen: Screen | null, history: HistoryEntry[]): Chat {
  if (chat.screen === screen && chat.history === history) return chat;
  const autoTitle = screen?.title?.trim();
  return {
    ...chat,
    screen,
    history,
    title: !chat.renamed && autoTitle ? autoTitle : chat.title,
    updatedAt: Date.now(),
  };
}

/** Return `chats` with the active chat updated from useScreenStore. Returns the same array when nothing changed. */
function withLive(chats: Chat[], activeChatId: string | null): Chat[] {
  if (!activeChatId) return chats;
  const idx = chats.findIndex((c) => c.id === activeChatId);
  if (idx < 0) return chats;
  const { screen, history } = useScreenStore.getState();
  const next = syncChat(chats[idx], screen, history);
  if (next === chats[idx]) return chats;
  const copy = [...chats];
  copy[idx] = next;
  return copy;
}

/** Load a chat's page into useScreenStore. The mirror listener ignores this change. */
let switching = false;
function loadScreen(chat: Chat | null) {
  switching = true;
  cancelInFlight();
  try {
    useScreenStore.setState({
      screen: chat?.screen ?? null,
      history: chat?.history ?? [],
      selectedId: null,
      editingId: null,
      aiBusyId: null,
      asking: false,
      status: "idle",
      lastSummary: null,
      error: null,
      past: [],
      future: [],
    });
  } finally {
    switching = false;
  }
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;

function flushNow() {
  if (syncTimer === undefined) return;
  clearTimeout(syncTimer);
  syncTimer = undefined;
  useWorkspaceStore.setState((s) => ({ chats: withLive(s.chats, s.activeChatId) }));
}

function scheduleSync() {
  if (syncTimer !== undefined) clearTimeout(syncTimer);
  syncTimer = setTimeout(flushNow, SYNC_DELAY_MS);
}

function parseHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((h) => {
    if (!h || typeof h !== "object") return [];
    const e = h as Record<string, unknown>;
    if (typeof e.prompt !== "string" || typeof e.summary !== "string") return [];
    const kind = e.kind === "page" || e.kind === "element" || e.kind === "answer" ? e.kind : undefined;
    return [{ prompt: e.prompt, summary: e.summary, ...(kind ? { kind } : {}),
        ...(e.suggestCode === true ? { suggestCode: true } : {}),
        ...(e.routed === true ? { routed: true } : {}),
        ...(typeof e.nodeId === "string" ? { nodeId: e.nodeId } : {}),
        ...(typeof e.label === "string" ? { label: e.label } : {}),
      }];
  });
}

/** Keep only well-formed chats from storage; a chat with a broken page is kept without its page. */
function parseChats(raw: unknown): Chat[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const r = c as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) return [];
    const screen = r.screen ? ScreenSchema.safeParse(r.screen) : null;
    return [
      {
        id: r.id,
        title: typeof r.title === "string" && r.title.trim() ? r.title : DEFAULT_CHAT_TITLE,
        projectId: typeof r.projectId === "string" ? r.projectId : null,
        archived: r.archived === true,
        createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
        updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : Date.now(),
        screen: screen?.success ? screen.data : null,
        history: parseHistory(r.history),
        renamed: r.renamed === true,
      },
    ];
  });
}

function parseProjects(raw: unknown): Project[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const r = p as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.name !== "string") return [];
    return [{ id: r.id, name: r.name }];
  });
}

function parseRunLog(raw: unknown): RunLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((e) => {
      if (!e || typeof e !== "object") return [];
      const r = e as Record<string, unknown>;
      if (typeof r.id !== "string" || typeof r.kind !== "string" || typeof r.detail !== "string") return [];
      return [{ id: r.id, at: typeof r.at === "number" ? r.at : 0, kind: r.kind, detail: r.detail }];
    })
    .slice(-RUN_LOG_LIMIT);
}

function parseIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string").slice(-DELETED_LIMIT);
}

const safeStorage = {
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // Storage full or blocked: keep working, just without saving.
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // Ignore.
    }
  },
};

type Loose = Record<string, unknown>;

function isRecord(v: unknown): v is Loose {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Parse a stored envelope ({ state, version }) into an object, or null when it is not one. */
function parseEnvelope(raw: string): Loose | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function records(raw: unknown): Loose[] {
  return Array.isArray(raw) ? raw.filter(isRecord) : [];
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

/** Turn persisted fields into workspace state. Used for both rehydration and cross-tab sync. */
function restoreState(p: Loose): Partial<WorkspaceState> {
  const deletedChatIds = parseIds(p.deletedChatIds);
  const gone = new Set(deletedChatIds);
  const chats = parseChats(p.chats).filter((c) => !gone.has(c.id));
  const activeChatId =
    typeof p.activeChatId === "string" && chats.some((c) => c.id === p.activeChatId) ? p.activeChatId : null;
  return {
    chats,
    projects: parseProjects(p.projects),
    activeChatId,
    runLog: parseRunLog(p.runLog),
    deletedChatIds,
  };
}

/** Workspace state currently in storage, or null when nothing is stored. */
function readStoredState(): Partial<WorkspaceState> | null {
  const raw = safeStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (raw === null) return null;
  const env = parseEnvelope(raw);
  if (!env) return null;
  return restoreState(isRecord(env.state) ? env.state : {});
}

/**
 * Combine this tab's outgoing state with what another tab already stored, so neither side drops
 * the other's chats, projects or run log entries. Chats are kept by id; when both tabs have one,
 * the copy with the later updatedAt wins. Deleted chats stay deleted.
 */
function mergeWithStored(key: string, incoming: string): string {
  const stored = safeStorage.getItem(key);
  if (stored === null) return incoming;
  const next = parseEnvelope(incoming);
  const prev = parseEnvelope(stored);
  if (!next || !prev) return incoming;

  const s = isRecord(next.state) ? next.state : {};
  const e = isRecord(prev.state) ? prev.state : {};

  const deletedChatIds = parseIds([...parseIds(e.deletedChatIds), ...parseIds(s.deletedChatIds)]);
  const gone = new Set(deletedChatIds);

  const storedChats = new Map(records(e.chats).flatMap((c) => (typeof c.id === "string" ? [[c.id, c] as const] : [])));
  const seen = new Set<string>();
  const chats: Loose[] = [];
  for (const c of records(s.chats)) {
    if (typeof c.id !== "string") continue;
    seen.add(c.id);
    const other = storedChats.get(c.id);
    chats.push(other && num(other.updatedAt) > num(c.updatedAt) ? other : c);
  }
  for (const [id, c] of storedChats) if (!seen.has(id)) chats.push(c);

  const projects = new Map<string, Loose>();
  for (const p of [...records(s.projects), ...records(e.projects)]) {
    if (typeof p.id === "string" && !projects.has(p.id)) projects.set(p.id, p);
  }

  const logs = new Map<string, Loose>();
  for (const l of [...records(s.runLog), ...records(e.runLog)]) {
    if (typeof l.id === "string" && !logs.has(l.id)) logs.set(l.id, l);
  }
  const runLog = [...logs.values()].sort((a, b) => num(a.at) - num(b.at)).slice(-RUN_LOG_LIMIT);

  return JSON.stringify({
    ...next,
    state: {
      ...s,
      chats: chats.filter((c) => typeof c.id === "string" && !gone.has(c.id)),
      projects: [...projects.values()],
      runLog,
      deletedChatIds,
    },
  });
}

/** Set while stored state is being applied to this tab, so applying it does not write it back. */
let applyingStored = false;

const workspaceStorage: StateStorage = {
  getItem: (k) => safeStorage.getItem(k),
  setItem: (k, v) => {
    if (applyingStored) return;
    safeStorage.setItem(k, mergeWithStored(k, v));
  },
  removeItem: (k) => safeStorage.removeItem(k),
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => {
      /** Chats with the live page merged into the active one. */
      const current = () => withLive(get().chats, get().activeChatId);

      return {
        chats: [],
        projects: [],
        activeChatId: null,
        runLog: [],
        deletedChatIds: [],

        newChat: (projectId = null) => {
          const activeId = get().activeChatId;
          if (activeId && isBusy()) {
            refuse("Starting a new chat");
            return activeId;
          }
          const chatsNow = current();
          const projectOk = projectId !== null && get().projects.some((p) => p.id === projectId);
          const chat = makeChat({ projectId: projectOk ? projectId : null });
          cancelPending();
          set({ chats: [chat, ...chatsNow], activeChatId: chat.id });
          loadScreen(chat);
          return chat.id;
        },

        selectChat: (id) => {
          const { activeChatId } = get();
          if (id === activeChatId) return;
          const chats = current();
          const target = chats.find((c) => c.id === id);
          if (!target) return;
          if (activeChatId && isBusy()) {
            refuse("Switching chats");
            return;
          }
          cancelPending();
          set({ chats, activeChatId: id });
          loadScreen(target);
        },

        renameChat: (id, title) => {
          const trimmed = title.trim();
          if (!trimmed) return;
          set({
            chats: current().map((c) =>
              c.id === id ? { ...c, title: trimmed, renamed: true, updatedAt: Date.now() } : c,
            ),
          });
        },

        deleteChat: (id) => {
          const { activeChatId } = get();
          if (activeChatId === id && isBusy()) {
            refuse("Deleting the open chat");
            return;
          }
          const remaining = current().filter((c) => c.id !== id);
          const deletedChatIds = tombstone(get().deletedChatIds, id);
          if (activeChatId !== id) {
            set({ chats: remaining, deletedChatIds });
            return;
          }
          // The deleted chat is no longer in `remaining`, so its live page is not written back.
          cancelPending();
          const next = mostRecent(remaining);
          if (next) {
            set({ chats: remaining, activeChatId: next.id, deletedChatIds });
            loadScreen(next);
          } else {
            const fresh = makeChat();
            set({ chats: [fresh], activeChatId: fresh.id, deletedChatIds });
            loadScreen(fresh);
          }
        },

        archiveChat: (id) => {
          set({
            chats: current().map((c) =>
              c.id === id ? { ...c, archived: !c.archived, updatedAt: Date.now() } : c,
            ),
          });
        },

        moveChat: (chatId, projectId) => {
          if (projectId !== null && !get().projects.some((p) => p.id === projectId)) return;
          set({
            chats: current().map((c) =>
              c.id === chatId ? { ...c, projectId, updatedAt: Date.now() } : c,
            ),
          });
        },

        createProject: (name, moveChatId) => {
          const project: Project = { id: uid(), name: name.trim() || DEFAULT_PROJECT_NAME };
          set((s) => ({
            projects: [...s.projects, project],
            chats: moveChatId
              ? current().map((c) =>
                  c.id === moveChatId ? { ...c, projectId: project.id, updatedAt: Date.now() } : c,
                )
              : s.chats,
          }));
          return project.id;
        },

        log: (kind, detail) =>
          set((s) => ({
            runLog: [...s.runLog, { id: uid(), at: Date.now(), kind, detail }].slice(-RUN_LOG_LIMIT),
          })),
      };
    },
    {
      name: WORKSPACE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => workspaceStorage),
      partialize: (s) => ({
        chats: s.chats,
        projects: s.projects,
        activeChatId: s.activeChatId,
        runLog: s.runLog,
        deletedChatIds: s.deletedChatIds,
      }),
      merge: (persisted, currentState) => ({
        ...currentState,
        ...restoreState(isRecord(persisted) ? persisted : {}),
      }),
    },
  ),
);

/** The active chat, or null before the workspace is set up. */
export const selectActiveChat = (s: Pick<WorkspaceState, "chats" | "activeChatId">): Chat | null =>
  s.chats.find((c) => c.id === s.activeChatId) ?? null;

/**
 * Make sure the workspace has chats and an active one, and return the active chat. Does not touch
 * useScreenStore. Adopts the live page when the active chat has none.
 */
function repairWorkspace(): Chat {
  const s = useWorkspaceStore.getState();
  const live = useScreenStore.getState();
  let chats = s.chats;
  let activeChatId = s.activeChatId;

  if (chats.length === 0) {
    const first = makeChat({
      screen: live.screen,
      history: live.history,
      title: live.screen?.title?.trim() || DEFAULT_CHAT_TITLE,
    });
    chats = [first];
    activeChatId = first.id;
  }
  if (!chats.some((c) => c.id === activeChatId)) {
    activeChatId = mostRecent(chats)!.id;
  }

  let active = chats.find((c) => c.id === activeChatId)!;
  // A chat without a page adopts the live page (for example, a page saved before workspaces existed).
  if (!active.screen && live.screen) {
    chats = chats.map((c) => (c.id === active.id ? syncChat(c, live.screen, live.history) : c));
    active = chats.find((c) => c.id === active.id)!;
  }

  useWorkspaceStore.setState({ chats, activeChatId });
  return active;
}

/**
 * Make sure there is an active chat that matches useScreenStore. Runs at load (after storage has
 * been read) and is safe to call again. With no chats yet, the current page becomes the first chat.
 */
export function ensureWorkspace(): void {
  loadScreen(repairWorkspace());
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

let pendingSync = false;

/**
 * Pick up chats saved by another tab. Keeps this tab's active chat when it still exists, and
 * reloads the live page only when the chat content actually differs. Waits while the page is busy.
 */
export function syncFromStorage(): void {
  if (isBusy()) {
    pendingSync = true;
    return;
  }
  pendingSync = false;
  // Save this tab's pending page first, so the merge keeps its latest edits.
  flushNow();
  const own = useWorkspaceStore.getState().activeChatId;
  const stored = readStoredState();
  if (!stored) return;

  applyingStored = true;
  try {
    useWorkspaceStore.setState({ ...stored, activeChatId: own });
  } finally {
    applyingStored = false;
  }

  const active = repairWorkspace();
  const live = useScreenStore.getState();
  if (active.id !== own || !sameJson(active.screen, live.screen) || !sameJson(active.history, live.history)) {
    loadScreen(active);
  }
}

// Mirror the live page into the active chat as it changes (debounced; see flushNow).
useScreenStore.subscribe((state, prev) => {
  if (switching) return;
  // A cross-tab sync that waited for the page to go idle runs now.
  if (pendingSync && !isBusy()) {
    pendingSync = false;
    setTimeout(syncFromStorage, 0);
  }
  if (state.screen === prev.screen && state.history === prev.history) return;
  if (!useWorkspaceStore.getState().activeChatId) return;
  scheduleSync();
});

// Write any pending mirror before the page unloads, and pick up other tabs' saves.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushNow);
  window.addEventListener("storage", (e) => {
    if (e.key === WORKSPACE_STORAGE_KEY) syncFromStorage();
  });
}

function cancelPending() {
  if (syncTimer === undefined) return;
  clearTimeout(syncTimer);
  syncTimer = undefined;
}

ensureWorkspace();
