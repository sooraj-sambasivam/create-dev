import type { Node, Screen } from "@create/shared";

/** Number of nodes in reading (pre-order) order. */
export function countNodes(nodes: Node[]): number {
  return nodes.reduce((n, node) => n + 1 + (node.type === "container" ? countNodes(node.children) : 0), 0);
}

/** Id of the n-th node (0-based) in reading order, or null. */
export function nodeIdAt(nodes: Node[], index: number): string | null {
  let i = 0;
  let found: string | null = null;
  const walk = (list: Node[]) => {
    for (const node of list) {
      if (found) return;
      if (i === index) {
        found = node.id;
        return;
      }
      i++;
      if (node.type === "container") walk(node.children);
    }
  };
  walk(nodes);
  return found;
}

/** Keep the first `n` nodes in reading order. A pre-order prefix always keeps ancestors, so the tree stays valid. */
function takeFirst(nodes: Node[], n: number): Node[] {
  let left = n;
  const walk = (list: Node[]): Node[] => {
    const out: Node[] = [];
    for (const node of list) {
      if (left <= 0) break;
      left--;
      out.push(node.type === "container" ? { ...node, children: walk(node.children) } : node);
    }
    return out;
  };
  return walk(nodes);
}

export interface RevealFrame {
  screen: Screen;
  /** Id of the node that appeared last in this frame (for the pop-in flash). */
  newestId: string | null;
}

/**
 * Progressively larger screens: one top-level section, then its children, in reading order.
 * `maxFrames` caps the count by revealing several nodes per frame. The last frame is always the full screen.
 */
export function buildRevealFrames(final: Screen, maxFrames = 48): RevealFrame[] {
  const total = countNodes(final.children);
  if (total === 0) return [{ screen: final, newestId: null }];
  const stride = Math.max(1, Math.ceil(total / Math.max(1, maxFrames)));
  const frames: RevealFrame[] = [];
  for (let n = stride; n < total; n += stride) {
    frames.push({ screen: { ...final, children: takeFirst(final.children, n) }, newestId: nodeIdAt(final.children, n - 1) });
  }
  frames.push({ screen: final, newestId: nodeIdAt(final.children, total - 1) });
  return frames;
}
