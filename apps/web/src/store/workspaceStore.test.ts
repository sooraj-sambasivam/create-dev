import { beforeEach, describe, expect, it, vi } from "vitest";

// Node has no localStorage; give the stores an in-memory one before they load.
const memory = vi.hoisted(() => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  return storage;
});

import { ScreenSchema } from "@create/shared";
import { useScreenStore } from "./screenStore";
import {
  DEFAULT_CHAT_TITLE,
  DEFAULT_PROJECT_NAME,
  RUN_LOG_LIMIT,
  WORKSPACE_STORAGE_KEY,
  ensureWorkspace,
  selectActiveChat,
  syncFromStorage,
  useWorkspaceStore,
} from "./workspaceStore";

const screen = (title: string) => ScreenSchema.parse({ title, children: [] });
const ws = () => useWorkspaceStore.getState();
const live = () => useScreenStore.getState();

function resetStores() {
  memory.clear();
  useScreenStore.setState({
    screen: null,
    history: [],
    past: [],
    future: [],
    selectedId: null,
    editingId: null,
    status: "idle",
    aiBusyId: null,
  });
  useWorkspaceStore.setState({
    chats: [],
    projects: [],
    activeChatId: null,
    outputOpen: false,
    runLog: [],
    deletedChatIds: [],
  });
  ensureWorkspace();
}

/** The workspace as another tab would have saved it. */
function storedChats(): { id: string; title: string }[] {
  const raw = memory.getItem(WORKSPACE_STORAGE_KEY);
  return raw ? JSON.parse(raw).state.chats : [];
}

function chatRecord(id: string, title: string, updatedAt: number) {
  return {
    id,
    title,
    projectId: null,
    archived: false,
    createdAt: 1,
    updatedAt,
    screen: null,
    history: [],
    renamed: true,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  resetStores();
});

describe("setup", () => {
  it("creates one active chat that adopts the current page", () => {
    expect(ws().chats).toHaveLength(1);
    expect(ws().activeChatId).toBe(ws().chats[0].id);
    expect(selectActiveChat(ws())?.title).toBe(DEFAULT_CHAT_TITLE);
  });

  it("is idempotent", () => {
    const before = ws().chats.map((c) => c.id);
    ensureWorkspace();
    expect(ws().chats.map((c) => c.id)).toEqual(before);
  });

  it("repairs an active id that points nowhere", () => {
    useWorkspaceStore.setState({ activeChatId: "missing" });
    ensureWorkspace();
    expect(ws().activeChatId).toBe(ws().chats[0].id);
  });
});

describe("chats", () => {
  it("newChat saves the old page and starts blank", () => {
    live().setScreen(screen("First"), "built first");
    const firstId = ws().activeChatId!;

    const secondId = ws().newChat();

    expect(secondId).not.toBe(firstId);
    expect(ws().activeChatId).toBe(secondId);
    expect(live().screen).toBeNull();
    expect(live().history).toEqual([]);
    expect(ws().chats.find((c) => c.id === firstId)?.screen?.title).toBe("First");
  });

  it("selectChat round-trips each chat's page and history", () => {
    live().setScreen(screen("Alpha"), "alpha built");
    const alphaId = ws().activeChatId!;
    const betaId = ws().newChat();
    live().setScreen(screen("Beta"), "beta built");

    ws().selectChat(alphaId);
    expect(live().screen?.title).toBe("Alpha");
    expect(live().history).toEqual([{ prompt: "(edited)", summary: "alpha built" }]);
    expect(live().selectedId).toBeNull();

    ws().selectChat(betaId);
    expect(live().screen?.title).toBe("Beta");
  });

  it("selectChat ignores unknown ids and the active id", () => {
    const id = ws().activeChatId!;
    ws().selectChat("nope");
    expect(ws().activeChatId).toBe(id);
    ws().selectChat(id);
    expect(ws().activeChatId).toBe(id);
  });

  it("mirrors page changes into the active chat", () => {
    vi.useFakeTimers();
    live().setScreen(screen("Mirrored"), "done");
    vi.advanceTimersByTime(300);
    const chat = selectActiveChat(ws())!;
    expect(chat.screen?.title).toBe("Mirrored");
    expect(chat.history).toHaveLength(1);
  });

  it("follows screen.title until the chat is renamed", () => {
    vi.useFakeTimers();
    live().setScreen(screen("Auto title"));
    vi.advanceTimersByTime(300);
    expect(selectActiveChat(ws())?.title).toBe("Auto title");

    ws().renameChat(ws().activeChatId!, "  My name  ");
    live().setScreen(screen("Later title"));
    vi.advanceTimersByTime(300);
    expect(selectActiveChat(ws())?.title).toBe("My name");
  });

  it("ignores empty renames", () => {
    const id = ws().activeChatId!;
    ws().renameChat(id, "   ");
    expect(ws().chats.find((c) => c.id === id)?.title).toBe(DEFAULT_CHAT_TITLE);
  });

  it("deleteChat on the active chat selects the most recent other chat", () => {
    const keepId = ws().activeChatId!;
    live().setScreen(screen("Keep"));
    const doomedId = ws().newChat();
    live().setScreen(screen("Doomed"));
    // Make `keep` the most recently updated survivor.
    useWorkspaceStore.setState((s) => ({
      chats: s.chats.map((c) => (c.id === keepId ? { ...c, updatedAt: Date.now() + 1000 } : c)),
    }));

    ws().deleteChat(doomedId);

    expect(ws().chats.some((c) => c.id === doomedId)).toBe(false);
    expect(ws().activeChatId).toBe(keepId);
    expect(live().screen?.title).toBe("Keep");
  });

  it("deleting the active chat does not write its page back", () => {
    const keepId = ws().activeChatId!;
    const doomedId = ws().newChat();
    live().setScreen(screen("Doomed page"));
    ws().deleteChat(doomedId);
    expect(ws().chats.find((c) => c.id === keepId)?.screen).toBeNull();
    expect(JSON.stringify(ws().chats)).not.toContain("Doomed page");
  });

  it("deleting the last chat creates a blank one", () => {
    const onlyId = ws().activeChatId!;
    ws().deleteChat(onlyId);
    expect(ws().chats).toHaveLength(1);
    expect(ws().activeChatId).not.toBe(onlyId);
    expect(live().screen).toBeNull();
  });

  it("deleting a non-active chat leaves the active page alone", () => {
    const activeId = ws().activeChatId!;
    live().setScreen(screen("Still here"));
    const otherId = ws().newChat();
    ws().selectChat(activeId);
    ws().deleteChat(otherId);
    expect(ws().activeChatId).toBe(activeId);
    expect(live().screen?.title).toBe("Still here");
  });

  it("archiveChat toggles the flag", () => {
    const id = ws().activeChatId!;
    ws().archiveChat(id);
    expect(ws().chats.find((c) => c.id === id)?.archived).toBe(true);
    ws().archiveChat(id);
    expect(ws().chats.find((c) => c.id === id)?.archived).toBe(false);
  });
});

describe("projects", () => {
  it("createProject returns an id and can move a chat in one step", () => {
    const chatId = ws().activeChatId!;
    const projectId = ws().createProject("Client work", chatId);
    expect(ws().projects).toEqual([{ id: projectId, name: "Client work" }]);
    expect(ws().chats.find((c) => c.id === chatId)?.projectId).toBe(projectId);
  });

  it("createProject falls back to a default name", () => {
    const id = ws().createProject("   ");
    expect(ws().projects.find((p) => p.id === id)?.name).toBe(DEFAULT_PROJECT_NAME);
  });

  it("moveChat moves into a project, back out with null, and ignores unknown projects", () => {
    const chatId = ws().activeChatId!;
    const projectId = ws().createProject("P");
    ws().moveChat(chatId, projectId);
    expect(ws().chats.find((c) => c.id === chatId)?.projectId).toBe(projectId);

    ws().moveChat(chatId, "ghost");
    expect(ws().chats.find((c) => c.id === chatId)?.projectId).toBe(projectId);

    ws().moveChat(chatId, null);
    expect(ws().chats.find((c) => c.id === chatId)?.projectId).toBeNull();
  });

  it("newChat can start inside a known project", () => {
    const projectId = ws().createProject("Inside");
    const id = ws().newChat(projectId);
    expect(ws().chats.find((c) => c.id === id)?.projectId).toBe(projectId);
    const bad = ws().newChat("ghost");
    expect(ws().chats.find((c) => c.id === bad)?.projectId).toBeNull();
  });
});

describe("output and run log", () => {
  it("toggleOutput flips the flag", () => {
    expect(ws().outputOpen).toBe(false);
    ws().toggleOutput();
    expect(ws().outputOpen).toBe(true);
    ws().toggleOutput();
    expect(ws().outputOpen).toBe(false);
  });

  it("log appends entries with ids and timestamps", () => {
    ws().log("generate", "made a page");
    ws().log("export", "zip");
    expect(ws().runLog.map((e) => [e.kind, e.detail])).toEqual([
      ["generate", "made a page"],
      ["export", "zip"],
    ]);
    expect(ws().runLog[0].id).not.toBe(ws().runLog[1].id);
    expect(typeof ws().runLog[0].at).toBe("number");
  });

  it("log keeps only the most recent RUN_LOG_LIMIT entries", () => {
    for (let i = 0; i < RUN_LOG_LIMIT + 25; i++) ws().log("tick", String(i));
    expect(ws().runLog).toHaveLength(RUN_LOG_LIMIT);
    expect(ws().runLog[0].detail).toBe("25");
    expect(ws().runLog.at(-1)?.detail).toBe(String(RUN_LOG_LIMIT + 24));
  });
});

describe("persistence", () => {
  it("writes workspace state under the storage key without the live-only fields", () => {
    ws().newChat();
    ws().toggleOutput();
    ws().log("k", "d");
    const stored = JSON.parse(memory.getItem(WORKSPACE_STORAGE_KEY)!);
    expect(stored.state.chats).toHaveLength(2);
    expect(stored.state.outputOpen).toBe(true);
    expect(stored.state.runLog).toHaveLength(1);
    expect(stored.state).not.toHaveProperty("screen");
  });

  it("rehydrates chats and drops malformed entries", async () => {
    const good = {
      id: "c1",
      title: "Saved",
      projectId: null,
      archived: false,
      createdAt: 1,
      updatedAt: 2,
      screen: screen("Saved page"),
      history: [{ prompt: "p", summary: "s" }, { bad: true }],
    };
    memory.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          chats: [good, { title: "no id" }, { id: "c2", screen: { nonsense: true }, history: "x" }],
          projects: [{ id: "p1", name: "Kept" }, { id: 5 }],
          activeChatId: "c1",
          outputOpen: true,
          runLog: [{ id: "l1", at: 3, kind: "k", detail: "d" }],
        },
      }),
    );

    await useWorkspaceStore.persist.rehydrate();

    expect(ws().chats.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(ws().chats[0].history).toEqual([{ prompt: "p", summary: "s" }]);
    expect(ws().chats[1].screen).toBeNull();
    expect(ws().chats[1].history).toEqual([]);
    expect(ws().projects).toEqual([{ id: "p1", name: "Kept" }]);
    expect(ws().activeChatId).toBe("c1");
    expect(ws().outputOpen).toBe(true);
    expect(ws().runLog).toHaveLength(1);
  });

  it("falls back to no active chat when the stored one is missing", async () => {
    memory.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ version: 1, state: { chats: [], activeChatId: "gone" } }));
    await useWorkspaceStore.persist.rehydrate();
    expect(ws().activeChatId).toBeNull();
  });
});

/** Write a workspace to storage as if another tab had saved it. */
function saveAsOtherTab(chats: unknown[], extra: Record<string, unknown> = {}) {
  memory.setItem(
    WORKSPACE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      state: { chats, projects: [], activeChatId: null, outputOpen: false, runLog: [], deletedChatIds: [], ...extra },
    }),
  );
}

describe("busy page", () => {
  it("refuses to switch, create or delete the open chat while a request is in flight", () => {
    live().setScreen(screen("Open"));
    const openId = ws().activeChatId!;
    const otherId = ws().newChat();
    ws().selectChat(openId);

    useScreenStore.setState({ status: "loading" });
    ws().selectChat(otherId);
    expect(ws().activeChatId).toBe(openId);
    expect(live().screen?.title).toBe("Open");

    expect(ws().newChat()).toBe(openId);
    expect(ws().chats).toHaveLength(2);

    ws().deleteChat(openId);
    expect(ws().chats.some((c) => c.id === openId)).toBe(true);
    expect(ws().runLog.at(-1)?.kind).toBe("chat");

    // A chat that is not open can still be deleted: it never touches the live page.
    ws().deleteChat(otherId);
    expect(ws().chats.some((c) => c.id === otherId)).toBe(false);
    expect(ws().activeChatId).toBe(openId);

    useScreenStore.setState({ status: "idle" });
    ws().selectChat(ws().newChat());
    expect(ws().chats).toHaveLength(2);
  });

  it("also blocks while an element edit is in flight", () => {
    const openId = ws().activeChatId!;
    const otherId = ws().newChat();
    ws().selectChat(openId);
    useScreenStore.setState({ aiBusyId: "node-1" });
    ws().selectChat(otherId);
    expect(ws().activeChatId).toBe(openId);
    useScreenStore.setState({ aiBusyId: null });
    ws().selectChat(otherId);
    expect(ws().activeChatId).toBe(otherId);
  });
});

describe("two tabs", () => {
  it("keeps chats another tab saved when this tab writes", () => {
    const mineChat = ws().chats[0];
    saveAsOtherTab([mineChat, chatRecord("theirs", "Theirs", Date.now() + 5)], { activeChatId: "theirs" });

    ws().newChat();

    const ids = storedChats().map((c) => c.id);
    expect(ids).toContain("theirs");
    expect(ids).toContain(mineChat.id);
  });

  it("keeps the newer copy of a chat when both tabs changed it", () => {
    const mineChat = ws().chats[0];
    saveAsOtherTab([{ ...chatRecord(mineChat.id, "Edited elsewhere", Date.now() + 1000) }]);

    ws().newChat();

    expect(storedChats().find((c) => c.id === mineChat.id)?.title).toBe("Edited elsewhere");
  });

  it("does not bring back a chat this tab deleted", () => {
    const mineId = ws().activeChatId!;
    const doomedId = ws().newChat();
    ws().selectChat(mineId);
    ws().deleteChat(doomedId);

    // Another tab still has the chat in its copy of storage.
    saveAsOtherTab([chatRecord(doomedId, "Doomed", Date.now() + 5)]);
    ws().newChat();

    expect(storedChats().some((c) => c.id === doomedId)).toBe(false);
  });

  it("syncFromStorage loads another tab's chats and keeps this tab's open chat", () => {
    const mineId = ws().activeChatId!;
    saveAsOtherTab([ws().chats[0], chatRecord("theirs", "Theirs", Date.now() + 5)], { activeChatId: "theirs" });

    syncFromStorage();

    expect(ws().chats.map((c) => c.id).sort()).toEqual([mineId, "theirs"].sort());
    expect(ws().activeChatId).toBe(mineId);
  });

  it("syncFromStorage waits for a busy page and runs once it is idle", async () => {
    saveAsOtherTab([ws().chats[0], chatRecord("theirs", "Theirs", Date.now() + 5)]);
    useScreenStore.setState({ status: "loading" });

    syncFromStorage();
    expect(ws().chats.some((c) => c.id === "theirs")).toBe(false);

    useScreenStore.setState({ status: "idle" });
    await new Promise((r) => setTimeout(r, 5));
    expect(ws().chats.some((c) => c.id === "theirs")).toBe(true);
  });
});
