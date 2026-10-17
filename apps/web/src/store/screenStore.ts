import { create } from "zustand";
import {
  childrenOf,
  defaultNode,
  findNode,
  findParentId,
  insertNode,
  moveNode,
  removeNode,
  updateNode,
  updateStyle,
  type Node,
  type NodeType,
  type Screen,
  type Style,
} from "@create/shared";
import * as api from "../lib/api";

export type Mode = "text" | "voice" | "canvas" | "narrate";
export type Status = "idle" | "loading" | "transcribing" | "error";

export interface HistoryEntry {
  prompt: string;
  summary: string;
}

const UNDO_LIMIT = 60;

interface ScreenState {
  mode: Mode;
  screen: Screen | null;
  status: Status;
  error: string | null;
  history: HistoryEntry[];

  /** Editor state. Any mode can read `selectedId` (e.g. Narrate: "put a button here"). */
  editMode: boolean;
  selectedId: string | null;
  editingId: string | null;
  past: Screen[];
  future: Screen[];

  setMode: (mode: Mode) => void;
  /** Any mode (canvas, narrate) can push a whole screen directly. Recorded for undo. */
  setScreen: (screen: Screen, summary?: string) => void;
  setStatus: (status: Status, error?: string | null) => void;
  /** Send a prompt to the model; refines the current screen when one exists. */
  generate: (prompt: string) => Promise<void>;
  reset: () => void;

  setEditMode: (on: boolean) => void;
  select: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  /** Push the current screen onto the undo stack without changing it (call before a live drag). */
  snapshot: () => void;
  /** Replace the screen without recording (for live drags after a snapshot()). */
  replaceLive: (next: Screen) => void;
  patchNode: (id: string, patch: Partial<Node>) => void;
  patchStyle: (id: string, patch: Partial<Style>) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  move: (id: string, parentId: string | null, index: number) => void;
  /** Insert a new node next to the selection (or inside it if it's an empty container). */
  addNode: (type: NodeType) => void;
  undo: () => void;
  redo: () => void;
}

function cloneWithNewIds(node: Node, screen: Screen): Node {
  const copy = structuredClone(node);
  const taken = new Set<string>();
  // collect existing ids
  const collect = (nodes: Node[]) => nodes.forEach((n) => { taken.add(n.id); if (n.type === "container") collect(n.children); });
  collect(screen.children);
  const rename = (n: Node) => {
    let id = `${n.id}-copy`;
    let i = 2;
    while (taken.has(id)) id = `${n.id}-copy${i++}`;
    taken.add(id);
    n.id = id;
    if (n.type === "container") n.children.forEach(rename);
  };
  rename(copy);
  return copy;
}

export const useScreenStore = create<ScreenState>((set, get) => {
  const record = (next: Screen) =>
    set((s) => ({
      screen: next,
      past: s.screen ? [...s.past.slice(-(UNDO_LIMIT - 1)), s.screen] : s.past,
      future: [],
    }));

  const withScreen = (fn: (screen: Screen) => Screen) => {
    const { screen } = get();
    if (!screen) return;
    const next = fn(screen);
    if (next !== screen) record(next);
  };

  return {
    mode: "text",
    screen: null,
    status: "idle",
    error: null,
    history: [],

    editMode: true,
    selectedId: null,
    editingId: null,
    past: [],
    future: [],

    setMode: (mode) => set({ mode }),

    setScreen: (screen, summary) => {
      record(screen);
      set((s) => ({
        status: "idle",
        error: null,
        history: summary ? [...s.history, { prompt: "(edited)", summary }] : s.history,
      }));
    },

    setStatus: (status, error = null) => set({ status, error }),

    generate: async (prompt) => {
      const trimmed = prompt.trim();
      if (!trimmed || get().status === "loading") return;
      set({ status: "loading", error: null, editingId: null });
      try {
        const { screen, history, selectedId, editMode } = get();
        const target = editMode && screen && selectedId && findNode(screen, selectedId) ? selectedId : null;
        const result = await api.generate(trimmed, screen, history.map((h) => h.prompt), target);
        record(result.screen);
        set((s) => ({
          status: "idle",
          history: [...s.history, { prompt: trimmed, summary: result.summary }],
          selectedId: s.selectedId && findNode(result.screen, s.selectedId) ? s.selectedId : null,
        }));
      } catch (err) {
        set({ status: "error", error: err instanceof Error ? err.message : "Something went wrong." });
      }
    },

    reset: () =>
      set({ screen: null, status: "idle", error: null, history: [], selectedId: null, editingId: null, past: [], future: [] }),

    setEditMode: (on) => set({ editMode: on, selectedId: on ? get().selectedId : null, editingId: null }),
    select: (id) => set((s) => ({ selectedId: id, editingId: s.editingId === id ? s.editingId : null })),
    setEditing: (id) => set((s) => ({ editingId: id, selectedId: id ?? s.selectedId })),

    snapshot: () =>
      set((s) => (s.screen ? { past: [...s.past.slice(-(UNDO_LIMIT - 1)), s.screen], future: [] } : {})),
    replaceLive: (next) => set({ screen: next }),

    patchNode: (id, patch) => withScreen((screen) => updateNode(screen, id, patch)),
    patchStyle: (id, patch) => withScreen((screen) => updateStyle(screen, id, patch)),

    remove: (id) => {
      withScreen((screen) => removeNode(screen, id));
      set((s) => ({ selectedId: s.selectedId === id ? null : s.selectedId, editingId: null }));
    },

    duplicate: (id) => {
      const { screen } = get();
      if (!screen) return;
      const node = findNode(screen, id);
      if (!node) return;
      const parentId = findParentId(screen, id) ?? null;
      const index = childrenOf(screen, parentId).findIndex((n) => n.id === id) + 1;
      const copy = cloneWithNewIds(node, screen);
      record(insertNode(screen, copy, parentId, index));
      set({ selectedId: copy.id });
    },

    move: (id, parentId, index) => withScreen((screen) => moveNode(screen, id, parentId, index)),

    addNode: (type) => {
      const { screen, selectedId } = get();
      if (!screen) return;
      const node = defaultNode(screen, type);
      let parentId: string | null = null;
      let index = screen.children.length;
      if (selectedId) {
        const selected = findNode(screen, selectedId);
        if (selected?.type === "container") {
          parentId = selected.id;
          index = selected.children.length;
        } else if (selected) {
          parentId = findParentId(screen, selectedId) ?? null;
          index = childrenOf(screen, parentId).findIndex((n) => n.id === selectedId) + 1;
        }
      }
      record(insertNode(screen, node, parentId, index));
      set({ selectedId: node.id });
    },

    undo: () =>
      set((s) => {
        const prev = s.past[s.past.length - 1];
        if (!prev || !s.screen) return {};
        return { screen: prev, past: s.past.slice(0, -1), future: [s.screen, ...s.future], editingId: null };
      }),
    redo: () =>
      set((s) => {
        const next = s.future[0];
        if (!next || !s.screen) return {};
        return { screen: next, future: s.future.slice(1), past: [...s.past, s.screen], editingId: null };
      }),
  };
});
