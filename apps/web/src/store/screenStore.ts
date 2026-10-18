import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  childrenOf,
  defaultNode,
  findNode,
  findParentId,
  insertNode,
  moveNode,
  removeNode,
  ScreenSchema,
  TEXT_FIELD,
  replaceNode,
  updateNode,
  updateStyle,
  type Asset,
  type Node,
  type NodeType,
  type Screen,
  type Style,
} from "@create/shared";
import * as api from "../lib/api";
import { askHistory } from "./askHistory";

export type Mode = "text" | "voice" | "canvas" | "narrate";
export type Status = "idle" | "loading" | "transcribing" | "error";

export interface HistoryEntry {
  prompt: string;
  summary: string;
  /** "element" for ✦ requests about one element, "page" for whole-page requests. */
  kind?: "page" | "element" | "answer";
  /** Answers (Chat mode): the answer was offered a "Switch to Code" chip. */
  suggestCode?: boolean;
  /** Answers: a question typed in Code mode, answered without editing ("Answered — no changes made"). */
  routed?: boolean;
  /** Element edits: the edited node and its label ("Heading · Ember"), kept even if the node is later removed. */
  nodeId?: string;
  label?: string;
}

/** "Heading · Ember": node type plus up to 28 characters of its text. Same rule as the pointer label. */
export function elementLabel(node: Node): string {
  const field = TEXT_FIELD[node.type];
  const raw = field ? (node as Record<string, unknown>)[field] : null;
  const t = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  const head = node.type.charAt(0).toUpperCase() + node.type.slice(1);
  if (!t) return head;
  return `${head} · ${t.length > 28 ? `${t.slice(0, 27)}…` : t}`;
}

/** Keep the AI's edited element on screen instead of letting the view jump. */
function revealNode(id: string | null | undefined) {
  if (!id || typeof requestAnimationFrame === "undefined") return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-screen-root] [data-node-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }),
  );
}

const UNDO_LIMIT = 60;

const FONT_STEPS = ["sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"] as const;
const TEXT_TYPES = new Set<string>(["heading", "text", "button", "link", "badge"]);
// Sizes the renderer actually gives each heading level (h3 is text-base).
const HEADING_DEFAULT = ["", "3xl", "2xl", "base"];
const WIDTH_STEP = 10;

type FastResult = { node: Node; summary: string } | null;

const FILLER = "(?:it|this|that|the (?:\\w+ ){0,2}\\w+)";
const MODIFIER = "(?:a (?:bit|little|lot)|slightly|much|way|bit|little)";
const rx = (body: string) => new RegExp(`^(?:please |can you |could you )?${body}[.!]?$`, "i");
const BIGGER = rx(`(?:make ${FILLER} (?:${MODIFIER} )?(?:bigger|larger)|(?:${MODIFIER} )?(?:bigger|larger)|increase (?:the )?size|enlarge ${FILLER})`);
const SMALLER = rx(`(?:make ${FILLER} (?:${MODIFIER} )?(?:smaller|tinier)|(?:${MODIFIER} )?smaller|decrease (?:the )?size|shrink ${FILLER})`);
const DELETE = rx(`(?:delete|remove|get rid of|trash)(?: ${FILLER})?`);
const BOLD = rx(`(?:make ${FILLER} bold(?:er)?|bold(?: ${FILLER})?)`);
const CENTER = rx(`(?:(?:centre|center)(?: ${FILLER})?|make ${FILLER} cent(?:re|er)(?:ed)?|(?:centre|center)[- ]align(?:ed)?(?: ${FILLER})?)`);

/** True when the prompt is a plain "delete/remove this" with nothing else in it. */
export function isDeletePrompt(prompt: string): boolean {
  return DELETE.test(prompt.trim());
}

/**
 * Edits that need no model: bigger/smaller (font size for text, width for the rest), bold, centre.
 * Returns the patched node and a one-line summary, or null when the prompt is anything else.
 * Delete is separate (see isDeletePrompt) because it removes the node instead of patching it.
 */
export function fastEdit(node: Node, prompt: string): FastResult {
  const text = prompt.trim();
  if (!text) return null;
  const dir = BIGGER.test(text) ? 1 : SMALLER.test(text) ? -1 : 0;
  if (dir !== 0) {
    if (TEXT_TYPES.has(node.type)) {
      const cur =
        node.style?.fontSize ??
        (node.type === "heading" ? (HEADING_DEFAULT[(node as { level?: number }).level ?? 2] ?? "2xl") : "base");
      const i = FONT_STEPS.indexOf(cur as (typeof FONT_STEPS)[number]);
      const next = FONT_STEPS[Math.min(FONT_STEPS.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir))];
      if (next === cur) return { node, summary: dir > 0 ? "Already the largest size." : "Already the smallest size." };
      return { node: { ...node, style: { ...node.style, fontSize: next } } as Node, summary: dir > 0 ? "Made it bigger." : "Made it smaller." };
    }
    const cur = node.widthPct ?? 60;
    const next = Math.min(100, Math.max(10, Math.round(cur + dir * WIDTH_STEP)));
    if (next === node.widthPct) return { node, summary: dir > 0 ? "Already full width." : "Already at the minimum width." };
    return { node: { ...node, widthPct: next } as Node, summary: dir > 0 ? "Made it bigger." : "Made it smaller." };
  }
  if (BOLD.test(text)) {
    return { node: { ...node, style: { ...node.style, weight: "bold" } } as Node, summary: "Made it bold." };
  }
  if (CENTER.test(text)) {
    return { node: { ...node, style: { ...node.style, align: "center" } } as Node, summary: "Centred it." };
  }
  return null;
}

/** Bumped to discard results of work that started before a reset or chat switch. */
let epoch = 0;
let genAbort: AbortController | null = null;
let pendingEdit: { id: string; prompt: string; resolve: (r: { error?: string; summary?: string }) => void } | null = null;

/** Drop in-flight generation and the queued edit; their results must not land on a different page. */
export function cancelInFlight(): void {
  epoch++;
  genAbort?.abort();
  genAbort = null;
  const p = pendingEdit;
  pendingEdit = null;
  p?.resolve({ error: "Cancelled." });
}

interface ScreenState {
  mode: Mode;
  screen: Screen | null;
  status: Status;
  error: string | null;
  history: HistoryEntry[];
  /** A Chat-mode question is waiting for its answer. */
  asking: boolean;

  /** Editor state. Any mode can read `selectedId` (e.g. Narrate: "put a button here"). */
  editMode: boolean;
  selectedId: string | null;
  editingId: string | null;
  /** Element currently being changed by the AI box, if any. */
  aiBusyId: string | null;
  /** The AI's latest message to the user (what it did, or what it couldn't do). */
  lastSummary: string | null;
  /** Images the user uploaded; sent to the AI so it can place them. */
  assets: Asset[];
  past: Screen[];
  future: Screen[];

  setMode: (mode: Mode) => void;
  /** Any mode (canvas, narrate) can push a whole screen directly. Recorded for undo. */
  setScreen: (screen: Screen, summary?: string) => void;
  /** Chat mode: answer a question about the page (and the selected element) without editing. */
  ask: (question: string, opts?: { routed?: boolean }) => Promise<void>;
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
  /** Ask the AI to change just this element. */
  editNodeWithAI: (id: string, prompt: string) => Promise<{ error?: string; summary?: string }>;
  uploadAsset: (file: File) => Promise<Asset>;
  dismissSummary: () => void;
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

function validScreens(list: unknown): Screen[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((s) => {
    const r = ScreenSchema.safeParse(s);
    return r.success ? [r.data] : [];
  });
}

export const useScreenStore = create<ScreenState>()(
  persist((set, get) => {
  const record = (next: Screen) =>
    set((s) => ({
      screen: next,
      past: s.screen ? [...s.past.slice(-(UNDO_LIMIT - 1)), s.screen] : s.past,
      future: [],
    }));

  // Streaming partials replace the screen, so edits made while generating would be overwritten.
  const locked = () => get().status === "loading";

  const withScreen = (fn: (screen: Screen) => Screen) => {
    const { screen } = get();
    if (!screen || locked()) return;
    const next = fn(screen);
    if (next !== screen) record(next);
  };

  type EditResult = { error?: string; summary?: string };

  const finishEdit = (prompt: string, summary: string, nextScreen: Screen, focusId: string | null, edited: Node) => {
    record(nextScreen);
    set((s) => ({
      aiBusyId: null,
      selectedId: focusId,
      history: [...s.history, { prompt, summary, kind: "element", nodeId: edited.id, label: elementLabel(edited) }],
    }));
    revealNode(focusId);
  };

  const runEdit = async (id: string, prompt: string): Promise<EditResult> => {
    const trimmed = prompt.trim();
    const { screen, aiBusyId, assets, status } = get();
    if (!trimmed || !screen || !findNode(screen, id)) return {};
    if (aiBusyId || status === "loading") {
      // One waiting slot: the second command runs after the first instead of being dropped.
      if (pendingEdit) return { error: "Another edit is already waiting. Try again in a moment." };
      return new Promise<EditResult>((resolve) => {
        pendingEdit = { id, prompt: trimmed, resolve };
      });
    }

    // No model call for clear cases.
    const node = findNode(screen, id)!;
    if (isDeletePrompt(trimmed)) {
      record(removeNode(screen, id));
      set((s) => ({
        selectedId: s.selectedId === id ? null : s.selectedId,
        editingId: null,
        history: [...s.history, { prompt: trimmed, summary: "Removed it.", kind: "element", nodeId: id, label: elementLabel(node) }],
      }));
      return { summary: "Removed it." };
    }
    const fast = fastEdit(node, trimmed);
    if (fast) {
      if (fast.node !== node) {
        record(replaceNode(screen, id, [fast.node]).screen);
        set((s) => ({ history: [...s.history, { prompt: trimmed, summary: fast.summary, kind: "element", nodeId: id, label: elementLabel(node) }] }));
      }
      return { summary: fast.summary };
    }

    const mine = epoch;
    set({ aiBusyId: id, editingId: null });
    try {
      const result = await api.editNode(screen, id, trimmed, assets);
      // A reset or chat switch happened while waiting: the result belongs to another page.
      if (epoch !== mine || get().aiBusyId !== id) return { error: "Cancelled." };
      // Apply to the latest screen so manual edits made while waiting are kept.
      const latest = get().screen;
      if (!latest || !findNode(latest, id)) {
        set({ aiBusyId: null });
        return { error: "That element was removed while the AI was working." };
      }
      const { screen: next, ids } = replaceNode(latest, id, result.nodes);
      finishEdit(trimmed, result.summary, next, ids[0] ?? null, node);
      return { summary: result.summary };
    } catch (err) {
      if (epoch === mine && get().aiBusyId === id) set({ aiBusyId: null });
      return { error: err instanceof Error ? err.message : "The AI edit failed." };
    } finally {
      if (epoch === mine) void drainPending();
    }
  };

  async function drainPending() {
    const p = pendingEdit;
    if (!p || get().aiBusyId || get().status === "loading") return;
    pendingEdit = null;
    p.resolve(await runEdit(p.id, p.prompt));
  }

  return {
    mode: "text",
    screen: null,
    status: "idle",
    error: null,
    history: [],
    asking: false,

    editMode: true,
    selectedId: null,
    editingId: null,
    aiBusyId: null,
    lastSummary: null,
    assets: [],
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
      set({ status: "loading", error: null, editingId: null, lastSummary: null });
      const mine = epoch;
      const ctrl = new AbortController();
      genAbort = ctrl;
      // The page as it was before this request; restored if the request fails.
      const before = get().screen;
      try {
        const { screen, history, assets } = get();
        const request = { prompt: trimmed, screen, history: history.filter((h) => h.kind !== "answer").map((h) => h.prompt).slice(-10), assets };
        // Sections appear as they finish. These updates are not undo steps.
        const result = await api.generateStream(
          request,
          (partial) => {
            if (epoch === mine) set({ screen: partial });
          },
          ctrl.signal,
        );
        if (epoch !== mine) return; // chat switched or reset: this result belongs to another page
        // One undo entry for the whole generation: the page as it was before.
        set((s) => ({
          screen: result.screen,
          past: before ? [...s.past.slice(-(UNDO_LIMIT - 1)), before] : s.past,
          future: [],
          status: "idle",
          lastSummary: result.summary,
          history: [...s.history, { prompt: trimmed, summary: result.summary, kind: "page" }],
          selectedId: s.selectedId && findNode(result.screen, s.selectedId) ? s.selectedId : null,
        }));
        revealNode(get().selectedId);
      } catch (err) {
        if (epoch !== mine) return;
        set({
          screen: before,
          status: "error",
          error: err instanceof Error ? err.message : "Something went wrong.",
        });
      } finally {
        if (genAbort === ctrl) genAbort = null;
        if (epoch === mine) void drainPending();
      }
    },

    reset: () => {
      cancelInFlight();
      set({
        screen: null,
        status: "idle",
        error: null,
        history: [],
        asking: false,
        selectedId: null,
        editingId: null,
        aiBusyId: null,
        lastSummary: null,
        past: [],
        future: [],
      });
    },

    ask: async (question, opts = {}) => {
      const q = question.trim();
      if (!q || get().asking) return;
      const { screen, history, selectedId } = get();
      const target = selectedId && screen ? findNode(screen, selectedId) : null;
      const label = target ? elementLabel(target) : undefined;
      const turns = askHistory(history);
      const mine = epoch;
      set({ asking: true });
      let entry: HistoryEntry;
      try {
        const res = await api.ask({
          question: q,
          screen,
          ...(target ? { pointer: { targetId: target.id, label } } : {}),
          history: turns,
        });
        entry = { prompt: q, summary: res.answer, kind: "answer", ...(res.suggestCode ? { suggestCode: true } : {}), ...(opts.routed ? { routed: true } : {}), ...(label ? { label } : {}) };
      } catch (err) {
        entry = { prompt: q, summary: `I couldn't answer that. ${err instanceof Error ? err.message : "Try again."}`, kind: "answer", ...(label ? { label } : {}) };
      }
      // A chat switch or reset while waiting: the answer belongs to another thread.
      if (epoch !== mine) return;
      set((s) => ({ asking: false, history: [...s.history, entry] }));
    },

    setEditMode: (on) => set({ editMode: on, selectedId: on ? get().selectedId : null, editingId: null }),
    select: (id) => set((s) => ({ selectedId: id, editingId: s.editingId === id ? s.editingId : null })),
    setEditing: (id) => set((s) => ({ editingId: id, selectedId: id ?? s.selectedId })),

    snapshot: () =>
      set((s) => (s.screen && s.status !== "loading" ? { past: [...s.past.slice(-(UNDO_LIMIT - 1)), s.screen], future: [] } : {})),
    replaceLive: (next) => {
      if (!locked()) set({ screen: next });
    },

    patchNode: (id, patch) => withScreen((screen) => updateNode(screen, id, patch)),
    patchStyle: (id, patch) => withScreen((screen) => updateStyle(screen, id, patch)),

    remove: (id) => {
      if (locked()) return;
      withScreen((screen) => removeNode(screen, id));
      set((s) => ({ selectedId: s.selectedId === id ? null : s.selectedId, editingId: null }));
    },

    duplicate: (id) => {
      const { screen } = get();
      if (!screen || locked()) return;
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
      if (!screen || locked()) return;
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

    editNodeWithAI: (id, prompt) => runEdit(id, prompt),

    uploadAsset: async (file) => {
      const asset = await api.uploadImage(file);
      set((s) => ({ assets: [...s.assets, asset] }));
      return asset;
    },

    dismissSummary: () => set({ lastSummary: null }),

    undo: () =>
      set((s) => {
        if (s.status === "loading") return {};
        const prev = s.past[s.past.length - 1];
        if (!prev || !s.screen) return {};
        return { screen: prev, past: s.past.slice(0, -1), future: [s.screen, ...s.future], editingId: null };
      }),
    redo: () =>
      set((s) => {
        if (s.status === "loading") return {};
        const next = s.future[0];
        if (!next || !s.screen) return {};
        return { screen: next, future: s.future.slice(1), past: [...s.past, s.screen], editingId: null };
      }),
  };
  },
    {
      // Autosave the page in this browser so a refresh or closed tab doesn't lose work.
      name: "create-dev:page",
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (k) => {
          try {
            return localStorage.getItem(k);
          } catch {
            return null;
          }
        },
        setItem: (k, v) => {
          try {
            localStorage.setItem(k, v);
          } catch {
            // Storage full or blocked: keep working, just without autosave.
          }
        },
        removeItem: (k) => {
          try {
            localStorage.removeItem(k);
          } catch {
            // Ignore.
          }
        },
      })),
      // Undo history is kept too (most recent steps only, to stay within browser storage limits).
      partialize: (s) => ({
        screen: s.screen,
        history: s.history,
        assets: s.assets,
        mode: s.mode,
        editMode: s.editMode,
        past: s.past.slice(-15),
        future: s.future.slice(0, 15),
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ScreenState>;
        // Drop a saved page that no longer matches the schema (e.g. after an upgrade).
        const screen = p.screen ? ScreenSchema.safeParse(p.screen) : null;
        return {
          ...current,
          ...p,
          screen: screen?.success ? screen.data : null,
          history: Array.isArray(p.history) ? p.history : [],
          assets: Array.isArray(p.assets) ? p.assets : [],
          past: validScreens(p.past),
          future: validScreens(p.future),
        };
      },
    },
  ),
);
