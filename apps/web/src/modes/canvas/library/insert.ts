import { applyOps, childrenOf, findNode, findParentId, type Node, type Screen, type ScreenOp } from "@create/shared";
import { useScreenStore } from "../../../store/screenStore";

/** Where new nodes go: after the selected node, inside a selected container, else at the end. */
export function planInsert(screen: Screen | null, selectedId: string | null): { parentId: string | null; index?: number } {
  if (!screen || !selectedId) return { parentId: null };
  const sel = findNode(screen, selectedId);
  if (!sel) return { parentId: null };
  if (sel.type === "container") return { parentId: sel.id };
  const parentId = findParentId(screen, selectedId) ?? null;
  return { parentId, index: childrenOf(screen, parentId).findIndex((n) => n.id === selectedId) + 1 };
}

export function insertOps(screen: Screen | null, selectedId: string | null, nodes: Node[]): ScreenOp[] {
  const { parentId, index } = planInsert(screen, selectedId);
  return nodes.map((node, i) => ({
    op: "insert" as const,
    parentId,
    ...(index === undefined ? {} : { index: index + i }),
    node,
  }));
}

/** Insert nodes into the page through applyOps. Returns the ids of the inserted top-level nodes. */
export function insertIntoPage(nodes: Node[], summary = "Added from library"): string[] {
  const store = useScreenStore.getState();
  const result = applyOps(store.screen, insertOps(store.screen, store.selectedId, nodes));
  if (!result.applied) return [];
  store.setScreen(result.screen, summary);
  const first = result.changedIds[0];
  if (first) store.select(first);
  return result.changedIds;
}

export const iconNode = (name: string): Node => ({ id: "icon", type: "icon", name, size: "lg" } as Node);

export const photoNode = (src: string, alt: string): Node =>
  ({ id: "photo", type: "image", alt: alt || "Photo", src, aspect: "video", size: "full" } as Node);
