import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { useScreenStore } from "../store/screenStore";
import { ensureWorkspace, useWorkspaceStore } from "../store/workspaceStore";
import { REMIX_SUMMARY, remixScreen } from "./remix";

const screen = (title: string) => ScreenSchema.parse({ title, children: [] });
const ws = () => useWorkspaceStore.getState();
const live = () => useScreenStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  memory.clear();
  // The user's existing chat, with a page and history, is active when the shared route loads.
  const original = screen("My page");
  useWorkspaceStore.setState({
    chats: [
      {
        id: "chat-a",
        title: "My page",
        projectId: null,
        archived: false,
        createdAt: 1,
        updatedAt: 1,
        screen: original,
        history: [{ prompt: "make a hero", summary: "Added a hero" }],
      },
    ],
    projects: [],
    activeChatId: "chat-a",
    outputOpen: false,
    runLog: [],
  });
  useScreenStore.setState({ screen: null, history: [], past: [], future: [], selectedId: null, editingId: null });
  ensureWorkspace();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("remixScreen", () => {
  it("leaves the active chat's page and history alone, and puts the remix in a new chat", () => {
    const shared = screen("Shared landing");
    const open = vi.fn();

    const newId = remixScreen(shared, open);

    // Let any pending mirror write run, the same as the debounce would.
    vi.advanceTimersByTime(1000);

    const original = ws().chats.find((c) => c.id === "chat-a")!;
    expect(original.screen?.title).toBe("My page");
    expect(original.history).toEqual([{ prompt: "make a hero", summary: "Added a hero" }]);

    const remixed = ws().chats.find((c) => c.id === newId)!;
    expect(ws().activeChatId).toBe(newId);
    expect(remixed.screen?.title).toBe("Shared landing");
    expect(remixed.history).toEqual([{ prompt: "(edited)", summary: REMIX_SUMMARY }]);
    expect(live().screen?.title).toBe("Shared landing");
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("does not write the remix into the previous chat when the mirror flushes", () => {
    remixScreen(screen("Shared landing"), () => {});
    vi.advanceTimersByTime(1000);

    const original = ws().chats.find((c) => c.id === "chat-a")!;
    expect(original.screen?.title).toBe("My page");
    expect(ws().chats).toHaveLength(2);
  });
});
