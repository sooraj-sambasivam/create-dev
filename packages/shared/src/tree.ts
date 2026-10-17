import type { Container, Node, Screen, Style } from "./schema";

/**
 * Immutable helpers for editing a Screen tree. Every function returns a new Screen and
 * never mutates its input, so they are safe for React state and undo stacks.
 * `parentId === null` means the top level of the screen.
 */

export function walkNodes(nodes: Node[], visit: (node: Node, parentId: string | null) => void, parentId: string | null = null): void {
  for (const n of nodes) {
    visit(n, parentId);
    if (n.type === "container") walkNodes(n.children, visit, n.id);
  }
}

export function findNode(screen: Screen, id: string): Node | null {
  let found: Node | null = null;
  walkNodes(screen.children, (n) => {
    if (n.id === id) found = n;
  });
  return found;
}

export function findParentId(screen: Screen, id: string): string | null | undefined {
  let result: string | null | undefined;
  walkNodes(screen.children, (n, parentId) => {
    if (n.id === id) result = parentId;
  });
  return result;
}

export function childrenOf(screen: Screen, parentId: string | null): Node[] {
  if (parentId === null) return screen.children;
  const parent = findNode(screen, parentId);
  return parent && parent.type === "container" ? parent.children : [];
}

export function isDescendant(screen: Screen, ancestorId: string, id: string): boolean {
  const ancestor = findNode(screen, ancestorId);
  if (!ancestor || ancestor.type !== "container") return false;
  let hit = false;
  walkNodes(ancestor.children, (n) => {
    if (n.id === id) hit = true;
  });
  return hit;
}

function mapNodes(nodes: Node[], fn: (node: Node) => Node | null): Node[] {
  const out: Node[] = [];
  for (const n of nodes) {
    const mapped = fn(n);
    if (!mapped) continue;
    out.push(mapped.type === "container" ? { ...mapped, children: mapNodes(mapped.children, fn) } : mapped);
  }
  return out;
}

/** Shallow-merge a patch into the node with this id. The caller keeps the patch type-correct. */
export function updateNode(screen: Screen, id: string, patch: Partial<Node>): Screen {
  return {
    ...screen,
    children: mapNodes(screen.children, (n) => (n.id === id ? ({ ...n, ...patch } as Node) : n)),
  };
}

export function updateStyle(screen: Screen, id: string, patch: Partial<Style>): Screen {
  const node = findNode(screen, id);
  if (!node) return screen;
  const base: Style = node.style ?? { color: null, background: null, radius: null };
  return updateNode(screen, id, { style: { ...base, ...patch } });
}

export function removeNode(screen: Screen, id: string): Screen {
  return { ...screen, children: mapNodes(screen.children, (n) => (n.id === id ? null : n)) };
}

export function insertNode(screen: Screen, node: Node, parentId: string | null, index: number): Screen {
  const insert = (list: Node[]) => {
    const i = Math.max(0, Math.min(index, list.length));
    return [...list.slice(0, i), node, ...list.slice(i)];
  };
  if (parentId === null) return { ...screen, children: insert(screen.children) };
  return {
    ...screen,
    children: mapNodes(screen.children, (n) =>
      n.id === parentId && n.type === "container" ? { ...n, children: insert(n.children) } : n,
    ),
  };
}

/** Move a node to a new parent and index. Refuses to move a container into itself. */
export function moveNode(screen: Screen, id: string, parentId: string | null, index: number): Screen {
  if (id === parentId || (parentId !== null && isDescendant(screen, id, parentId))) return screen;
  const node = findNode(screen, id);
  if (!node) return screen;
  const oldParent = findParentId(screen, id);
  const oldIndex = childrenOf(screen, oldParent ?? null).findIndex((n) => n.id === id);
  let target = index;
  if (oldParent === parentId && oldIndex < index) target -= 1;
  return insertNode(removeNode(screen, id), node, parentId, target);
}

let counter = 0;
export function uniqueId(screen: Screen, prefix: string): string {
  const taken = new Set<string>();
  walkNodes(screen.children, (n) => taken.add(n.id));
  let candidate = `${prefix}-${++counter}`;
  while (taken.has(candidate)) candidate = `${prefix}-${++counter}`;
  return candidate;
}

/** A sensible default node of each type, for an "Add element" menu. */
export function defaultNode(screen: Screen, type: Node["type"]): Node {
  const nid = uniqueId(screen, type);
  switch (type) {
    case "heading":
      return { id: nid, type, text: "New heading", level: 2 };
    case "text":
      return { id: nid, type, text: "Some text that explains what this section is about.", tone: "default" };
    case "textbox":
      return { id: nid, type, label: "Label", placeholder: "Type here…", multiline: false };
    case "button":
      return { id: nid, type, label: "Button", variant: "primary" };
    case "image":
      return { id: nid, type, alt: "Placeholder image", aspect: "video" };
    case "checkbox":
      return { id: nid, type, label: "I agree" };
    case "select":
      return { id: nid, type, label: "Choose one", options: ["Option A", "Option B"] };
    case "link":
      return { id: nid, type, text: "Learn more" };
    case "divider":
      return { id: nid, type };
    case "container":
      return {
        id: nid,
        type,
        direction: "row",
        gap: "md",
        align: "center",
        justify: "start",
        padding: "md",
        background: "surface",
        width: "full",
        children: [],
      } satisfies Container;
  }
}

/**
 * After the model regenerates a screen, carry over user styling for nodes it kept (same id)
 * but returned without style / widthPct. Protects manual tweaks from being wiped by an
 * unrelated prompt.
 */
export function preserveStyles(prev: Screen | null | undefined, next: Screen): Screen {
  if (!prev) return next;
  const old = new Map<string, Node>();
  walkNodes(prev.children, (n) => old.set(n.id, n));
  return {
    ...next,
    children: mapNodes(next.children, (n) => {
      const before = old.get(n.id);
      if (!before) return n;
      const style = n.style ?? before.style ?? null;
      const widthPct = n.widthPct ?? before.widthPct ?? null;
      return style === n.style && widthPct === n.widthPct ? n : ({ ...n, style, widthPct } as Node);
    }),
  };
}
